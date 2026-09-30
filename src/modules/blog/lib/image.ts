import { createHash } from "node:crypto";
import sharp from "sharp";

/**
 * 博客图片处理（制作流程 Step 4.2）。
 *
 * 安全要点：
 * 1. **不信任前端的 MIME 与扩展名** —— 一律按**魔数**（文件头字节）判定真实类型（C-07）；
 * 2. **EXIF 必须剥离** —— 手机照片常含 GPS 坐标，泄露即隐私事故（B-15）；
 * 3. 统一转 WebP + 限制最长边，避免用户塞 40MB 原图把存储打爆；
 * 4. 内容哈希去重 —— 同一张图重复粘贴不产生第二个文件（B-17）。
 *
 * 关于 EXIF 的一个细节：sharp 的 `.rotate()` 不带参数时会**按 EXIF Orientation 自动旋转**，
 * 而输出时不调用 `.withMetadata()` / `.keepExif()` 即可丢弃全部元数据。
 * 顺序很重要：先 rotate（用 EXIF 摆正）再转码，否则竖拍照片会躺倒。
 */

/** 允许的图片类型（与 PRD 附录 A 的 imageUploadSchema 白名单一致） */
export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export const ALLOWED_IMAGE_MIMES: readonly ImageMime[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * 按魔数判定图片类型（只看文件头，不看扩展名/Content-Type）。
 * 返回 null 表示"不是受支持的图片" —— 包括被改名的 .svg / 文本文件。
 */
export function detectImageMime(buffer: Buffer): ImageMime | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // GIF: 47 49 46 38 ("GIF8")
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return "image/gif";

  // WebP: "RIFF" + 4 字节长度 + "WEBP"
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

/** 文件扩展名（落盘用） */
export function extensionFor(mime: ImageMime): string {
  return mime === "image/jpeg" ? "jpg" : mime.replace("image/", "");
}

/** 内容哈希（sha256，取前 32 位十六进制）：去重的键 */
export function contentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 32);
}

export type ProcessedImage = {
  /** 主图（WebP，最长边 ≤ 配置值） */
  main: Buffer;
  /** 缩略图（WebP，最长边 400px） */
  thumb: Buffer;
  width: number;
  height: number;
  /** 处理后的主图字节数（配额统计用） */
  size: number;
  /** 原始内容哈希（去重的键，同一原图必然同哈希） */
  hash: string;
};

export type ProcessImageOptions = {
  /** 主图最长边上限（默认 2000） */
  maxDimension?: number;
  /** WebP 质量（默认 82） */
  quality?: number;
  /** 缩略图最长边（默认 400） */
  thumbDimension?: number;
};

/**
 * 处理上传的图片：摆正方向 → 缩放 → 转 WebP → 生成缩略图。
 * 全程不保留任何元数据（EXIF / ICC / GPS 全部丢弃）。
 */
export async function processImage(
  input: Buffer,
  options: ProcessImageOptions = {},
): Promise<ProcessedImage> {
  const maxDimension = options.maxDimension ?? 2000;
  const quality = options.quality ?? 82;
  const thumbDimension = options.thumbDimension ?? 400;

  // rotate() 无参 → 依 EXIF Orientation 摆正像素，随后元数据不再被写入
  const pipeline = sharp(input, { animated: false }).rotate();
  const meta = await pipeline.metadata();

  const main = await pipeline
    .clone()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: "inside",
      withoutEnlargement: true, // 小图不放大，避免无意义的体积增长
    })
    .webp({ quality })
    .toBuffer();

  const thumb = await pipeline
    .clone()
    .resize({ width: thumbDimension, height: thumbDimension, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();

  // 处理后尺寸可能与原图不同（缩放过），以主图实际输出为准重新读取
  const outMeta = await sharp(main).metadata();

  return {
    main,
    thumb,
    width: outMeta.width ?? meta.width ?? 0,
    height: outMeta.height ?? meta.height ?? 0,
    size: main.byteLength,
    hash: contentHash(input),
  };
}

/** 校验是否为"看起来像图片"的真实图片：魔数通过 + sharp 能解析出宽高 */
export async function assertDecodableImage(buffer: Buffer): Promise<ImageMime> {
  const mime = detectImageMime(buffer);
  if (!mime) throw new Error("UNSUPPORTED_IMAGE");

  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) throw new Error("no dimensions");
  } catch {
    // 魔数对但解析失败 → 损坏文件或精心构造的载荷
    throw new Error("CORRUPT_IMAGE");
  }
  return mime;
}
