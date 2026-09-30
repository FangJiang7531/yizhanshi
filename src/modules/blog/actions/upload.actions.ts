"use server";

import { requireNonGuest } from "@/lib/auth/guards";
import { env } from "@/config/env";
import { fail, ok, ValidationError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { imageUploadSchema } from "../schemas";
import { createBlogImageService, type UploadedImage } from "../services/image.service";

/**
 * 图片上传控制器（制作流程 Step 4.2）。
 *
 * 注意这里是本模块唯一接收 `FormData` 的 Action —— 文件流无法走 JSON 序列化。
 * 职责切分：
 * - 本层：权限守卫 + 取文件 + `imageUploadSchema` 粗筛（体积上限与 MIME 白名单）；
 * - 服务层：魔数校验（不信任声明）、精确大小（受 env 配置驱动）、配额、EXIF 剥离、哈希去重。
 * 两层都校验不是冗余：本层给出**快速失败 + 友好文案**，服务层才是安全边界。
 */

export async function uploadBlogImageAction(formData: FormData): Promise<ActionResult<UploadedImage>> {
  try {
    const user = await requireNonGuest();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return fail(new ValidationError({ file: ["请选择要上传的图片"] }, "请选择要上传的图片"));
    }
    if (file.size === 0) {
      return fail(new ValidationError({ file: ["文件内容为空"] }, "文件内容为空"));
    }

    // 粗筛：体积上界 + MIME 白名单（真正的判定以服务层的文件头校验为准）
    imageUploadSchema.parse({ size: file.size, mime: file.type });

    const buffer = Buffer.from(await file.arrayBuffer());
    const service = createBlogImageService();
    const result = await service.upload({
      userId: user.id,
      buffer,
      declaredMime: file.type,
    });

    logger.info(
      { userId: user.id, size: result.size, deduped: result.deduped, width: result.width, height: result.height },
      "博客图片上传成功",
    );
    return ok(result);
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "uploadBlogImageAction");
    return fail(err);
  }
}

/** 当前用户的图片空间占用（编辑器配额提示用） */
export async function getImageQuotaAction(): Promise<ActionResult<{ usedBytes: number; limitBytes: number }>> {
  try {
    const user = await requireNonGuest();
    const service = createBlogImageService();
    const usedBytes = await service.usedBytes(user.id);
    const limitBytes = env.BLOG_USER_QUOTA_MB * 1024 * 1024;
    return ok({ usedBytes, limitBytes });
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "getImageQuotaAction");
    return fail(err);
  }
}
