import { env } from "@/config/env";
import { storage, type StorageAdapter } from "@/lib/storage";
import { ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  ALLOWED_IMAGE_MIMES,
  assertDecodableImage,
  processImage,
  type ImageMime,
} from "../lib/image";
import { buildFileUrl, parseStorageUrl, signStorageKey } from "../lib/signed-url";

/**
 * 博客图片服务（制作流程 Step 4.2）。
 *
 * 路径约定（这是访问控制的基石，不能随意改）：
 * - `blog/draft/<userId>/<hash>.webp`  草稿区：**必须带有效签名**才能读取
 * - `blog/pub/<userId>/<hash>.webp`    公开区：无需签名，`/api/files/**` 直接放行
 *
 * 发布时（`promoteForPublish`）把正文里引用到的草稿图片复制到公开区并重写 URL，
 * 这就是 PRD §5.3 步骤④「图片固化：草稿态签名 URL 转公开路径」。
 * 用**复制**而非移动：哈希去重下同一张图可能被多篇草稿共用，移动会让其它草稿裂图。
 */

const DRAFT_PREFIX = (userId: string) => `blog/draft/${userId}`;
const PUB_PREFIX = (userId: string) => `blog/pub/${userId}`;

/** 正文中的站内文件 URL（含可选查询串） */
const STORAGE_URL_PATTERN = /\/api\/files\/[A-Za-z0-9/_\-.]+\.(?:webp|png|jpg|jpeg|gif)(?:\?[^\s)"'<>\\]*)?/gi;

export type UploadedImage = {
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  size: number;
  /** 是否命中哈希去重（未产生新文件） */
  deduped: boolean;
};

export type BlogImageServiceOptions = {
  storage?: StorageAdapter;
  maxSizeMb?: number;
  quotaMb?: number;
  /** 签名有效期（毫秒），默认 7 天 */
  signatureTtlMs?: number;
};

export class UnsupportedImageError extends ValidationError {
  constructor(message = "仅支持 JPEG / PNG / WebP / GIF 图片") {
    super({ file: [message] }, message);
  }
}

export function createBlogImageService(options: BlogImageServiceOptions = {}) {
  const store = options.storage ?? storage;
  const maxSizeBytes = (options.maxSizeMb ?? env.BLOG_IMAGE_MAX_SIZE_MB) * 1024 * 1024;
  const quotaBytes = (options.quotaMb ?? env.BLOG_USER_QUOTA_MB) * 1024 * 1024;
  const signatureTtlMs = options.signatureTtlMs ?? 7 * 24 * 60 * 60 * 1000;

  /** 已用配额（草稿区 + 公开区；哈希去重后同一张图只占一份草稿 + 一份公开） */
  async function usedBytes(userId: string): Promise<number> {
    if (!store.usage) return 0; // 适配器不支持统计时跳过配额（记为降级，不阻断上传）
    const [draft, pub] = await Promise.all([store.usage(DRAFT_PREFIX(userId)), store.usage(PUB_PREFIX(userId))]);
    return draft + pub;
  }

  /** 为草稿区的键生成带签名的 URL */
  function signedDraftUrl(key: string): string {
    const expiresAtMs = Date.now() + signatureTtlMs;
    return buildFileUrl(key, { expiresAtMs, sig: signStorageKey(key, expiresAtMs, env.AUTH_SECRET) });
  }

  return {
    /** 当前用户已用配额（字节） */
    usedBytes,

    /**
     * 上传并处理图片。
     * 顺序：大小 → 声明 MIME 白名单 → **魔数**（不信任前端）→ 可解码性 → 配额 → 处理 → 去重 → 落盘。
     */
    async upload(params: {
      userId: string;
      buffer: Buffer;
      declaredMime: string;
    }): Promise<UploadedImage> {
      const { userId, buffer, declaredMime } = params;

      // ① 大小（前端也会拦，但服务端必须独立判断）
      if (buffer.byteLength > maxSizeBytes) {
        const mb = Math.round(maxSizeBytes / 1024 / 1024);
        throw new ValidationError({ file: [`图片不得超过 ${mb}MB`] }, `图片不得超过 ${mb}MB`);
      }
      if (buffer.byteLength === 0) {
        throw new ValidationError({ file: ["文件内容为空"] }, "文件内容为空");
      }

      // ② 声明类型白名单（快速失败，给出更友好的文案）
      if (!ALLOWED_IMAGE_MIMES.includes(declaredMime as ImageMime)) {
        throw new UnsupportedImageError();
      }

      // ③ 魔数校验 —— 文件头说了算，改扩展名/.svg 伪装在这里被拦下
      try {
        await assertDecodableImage(buffer);
      } catch {
        throw new UnsupportedImageError("文件不是有效的图片（已按文件头校验，改扩展名无效）");
      }

      // ④ 配额
      const used = await usedBytes(userId);
      const projected = used + buffer.byteLength;
      if (used > 0 && projected > quotaBytes) {
        const mb = Math.round(quotaBytes / 1024 / 1024);
        throw new ValidationError({ file: [`图片空间已满（上限 ${mb}MB），请先清理旧图`] }, "图片空间不足");
      }

      // ⑤ 处理：摆正 → 缩放 → WebP（丢弃全部 EXIF/ICC/GPS）
      const processed = await processImage(buffer);
      const mainKey = `${DRAFT_PREFIX(userId)}/${processed.hash}.webp`;
      const thumbKey = `${DRAFT_PREFIX(userId)}/${processed.hash}_thumb.webp`;

      // ⑥ 内容哈希去重：同一张原图第二次上传直接复用，不重复占用空间
      const existing = await store.get(mainKey);
      const deduped = existing !== null;

      if (!deduped) {
        await store.put(mainKey, processed.main);
        await store.put(thumbKey, processed.thumb);
      }

      return {
        url: signedDraftUrl(mainKey),
        thumbUrl: signedDraftUrl(thumbKey),
        width: processed.width,
        height: processed.height,
        size: deduped ? existing.byteLength : processed.size,
        deduped,
      };
    },

    /**
     * 发布固化：把 markdown（与封面）中引用的草稿区图片复制到公开区，并重写为免签名 URL。
     * 返回重写后的文本；未被引用的草稿图片保持原样（仍在草稿区，不可公开访问）。
     */
    async promoteForPublish(
      userId: string,
      content: string | null | undefined,
    ): Promise<string | null | undefined> {
      if (!content) return content;
      const urls = content.match(STORAGE_URL_PATTERN);
      if (!urls || urls.length === 0) return content;

      let output = content;
      const draftPrefix = `${DRAFT_PREFIX(userId)}/`;

      for (const raw of new Set(urls)) {
        const parsed = parseStorageUrl(raw);
        if (!parsed) continue;
        if (!parsed.key.startsWith(draftPrefix)) continue; // 已在公开区 / 非本站资源：跳过

        const pubKey = `${PUB_PREFIX(userId)}/${parsed.key.slice(draftPrefix.length)}`;
        try {
          if (!(await store.get(pubKey))) {
            const data = await store.get(parsed.key);
            if (!data) {
              logger.warn({ key: parsed.key }, "发布固化：草稿图片不存在，保留原 URL");
              continue;
            }
            await store.put(pubKey, data);
          }
          // 同一 URL 可能出现在多处（含不同签名），逐个替换
          output = output.split(raw).join(buildFileUrl(pubKey));
        } catch (err) {
          logger.error(
            { key: parsed.key, err: err instanceof Error ? err.message : String(err) },
            "发布固化失败，保留草稿 URL",
          );
        }
      }
      return output;
    },
  };
}

export type BlogImageService = ReturnType<typeof createBlogImageService>;

/** 提取文本中引用的全部站内文件 URL（供预览清理、引用统计等场景复用） */
export function extractStorageUrls(text: string): string[] {
  return [...new Set(text.match(STORAGE_URL_PATTERN) ?? [])];
}
