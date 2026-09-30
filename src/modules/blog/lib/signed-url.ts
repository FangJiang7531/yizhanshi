import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 存储键的签名 URL（B-16：草稿中的图片必须是签名 URL，而非公开路径）。
 *
 * 设计取舍：不做**过期即失效**的短时令牌，而是签发"有效期足够长"的签名
 * （默认 7 天）—— 理由是草稿可能在编辑器里放很久，短时令牌会导致
 * "打开昨天写的草稿，图片全裂"。真正的访问控制由**路径前缀**承担：
 * `blog/draft/**` 必须带有效签名，`blog/pub/**` 才是公开的。
 * 也就是说：即使签名过期，草稿图片也不会泄露，只是需要重新加载页面拿到新签名。
 */

/** 生成签名：HMAC(secret, key + expiresAt) 前 32 位十六进制 */
export function signStorageKey(key: string, expiresAtMs: number, secret: string): string {
  return createHmac("sha256", secret).update(`${key}:${expiresAtMs}`).digest("hex").slice(0, 32);
}

/** 校验签名（恒定时间比较，防时序侧信道） */
export function verifyStorageKeySignature(
  key: string,
  expiresAtMs: number,
  signature: string,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < now) return false;
  if (!signature) return false;
  const expected = signStorageKey(key, expiresAtMs, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 把（可能带查询串的）URL 中的路径与查询拆开，便于在正文里重写 URL */
export type StorageUrlParts = {
  /** 例如 blog/draft/abc/1234.webp */
  key: string;
  /** 形如 exp=...&sig=... */
  query: string;
};

/** 从站内文件 URL 中解析出存储键：/api/files/<key>?<query> */
export function parseStorageUrl(url: string): StorageUrlParts | null {
  const match = /^\/api\/files\/([A-Za-z0-9/_\-.]+\.(?:webp|png|jpg|jpeg|gif))(?:\?(.*))?$/i.exec(url.trim());
  if (!match || !match[1]) return null;
  return { key: match[1], query: match[2] ?? "" };
}

/** 构造站内文件 URL（可选带签名） */
export function buildFileUrl(key: string, signature?: { expiresAtMs: number; sig: string }): string {
  const base = `/api/files/${key}`;
  return signature ? `${base}?exp=${signature.expiresAtMs}&sig=${signature.sig}` : base;
}
