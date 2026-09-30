import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

/**
 * Slug 生成（制作流程 Step 3.2）
 * - 英文/数字标题 → 标准 slugify（小写 + 连字符）
 * - 中文等无 ASCII 可用的标题 → `post-<36 进制时间戳>`（稳定、无冲突、不暴露标题）
 * - 改标题不自动改 slug（避免已收录链接失效）；提供显式"更新链接标识"操作
 */

export const SLUG_REGEX = /^[a-z0-9-]{3,80}$/;

/** 标题 → 基础 slug（不做唯一性处理） */
export function slugify(title: string, now: number = Date.now()): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    // 仅保留 ASCII 字母数字与空白（中文等直接丢弃）
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  // 可用 ASCII 过少（纯中文标题 / 符号标题）→ 时间戳策略
  if (base.replace(/-/g, "").length < 3) {
    return `post-${now.toString(36)}`;
  }
  return base;
}

/**
 * 生成全局唯一 slug：冲突时追加 -2 / -3 …
 * 与数据库唯一索引配合使用（极端并发下唯一索引是最终兜底）。
 */
export async function ensureUniqueSlug(
  base: string,
  excludeId?: string,
  db: PrismaClient = defaultPrisma,
): Promise<string> {
  let candidate = base;
  let i = 2;
  // 上限保护：避免异常数据导致死循环
  while (i < 1000) {
    const exists = await db.blogPost.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!exists) return candidate;
    candidate = `${base}-${i++}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** 校验用户手改的 slug 合法性 */
export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}
