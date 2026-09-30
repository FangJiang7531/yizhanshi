import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

/**
 * 计数对账（制作流程 Step 2.3）。
 *
 * 冗余计数是性能缓存，**明细表才是真源**。本模块负责：
 * 1. 检出漂移（redundant ≠ actual）；
 * 2. 可选修正（把冗余计数写回为明细实际数量）。
 *
 * 由 scripts/reconcile-counters.ts（CLI）与 JobRunner（定时）调用。
 * 放在 services 层而非 scripts 内，是为了让它同时被 tsc 类型检查与集成测试覆盖。
 */

export type DriftRow = {
  kind: "post.likeCount" | "post.repostCount" | "post.commentCount" | "post.viewCount" | "comment.likeCount";
  id: string;
  label: string;
  redundant: number;
  actual: number;
};

export type ReconcileResult = {
  scanned: number;
  drifted: DriftRow[];
  fixed: number;
};

/** 逐类检出漂移。使用原生 SQL 让"比较"发生在数据库侧，避免把全表拉进内存。 */
async function detectDrift(db: PrismaClient): Promise<DriftRow[]> {
  const drift: DriftRow[] = [];

  const postLike = await db.$queryRaw<{ id: string; slug: string; redundant: number; actual: number }[]>`
    SELECT p.id, p.slug,
           p."likeCount"::int AS redundant,
           (SELECT COUNT(*)::int FROM "PostLike" l WHERE l."postId" = p.id) AS actual
    FROM "BlogPost" p
    WHERE p."likeCount" <> (SELECT COUNT(*)::int FROM "PostLike" l WHERE l."postId" = p.id)
  `;
  for (const r of postLike) {
    drift.push({ kind: "post.likeCount", id: r.id, label: r.slug, redundant: r.redundant, actual: r.actual });
  }

  const postRepost = await db.$queryRaw<{ id: string; slug: string; redundant: number; actual: number }[]>`
    SELECT p.id, p.slug,
           p."repostCount"::int AS redundant,
           (SELECT COUNT(*)::int FROM "PostRepost" r WHERE r."postId" = p.id) AS actual
    FROM "BlogPost" p
    WHERE p."repostCount" <> (SELECT COUNT(*)::int FROM "PostRepost" r WHERE r."postId" = p.id)
  `;
  for (const r of postRepost) {
    drift.push({ kind: "post.repostCount", id: r.id, label: r.slug, redundant: r.redundant, actual: r.actual });
  }

  const postComment = await db.$queryRaw<{ id: string; slug: string; redundant: number; actual: number }[]>`
    SELECT p.id, p.slug,
           p."commentCount"::int AS redundant,
           (SELECT COUNT(*)::int FROM "Comment" c
             WHERE c."postId" = p.id AND c.status = 'APPROVED' AND c."deletedAt" IS NULL) AS actual
    FROM "BlogPost" p
    WHERE p."commentCount" <> (SELECT COUNT(*)::int FROM "Comment" c
             WHERE c."postId" = p.id AND c.status = 'APPROVED' AND c."deletedAt" IS NULL)
  `;
  for (const r of postComment) {
    drift.push({ kind: "post.commentCount", id: r.id, label: r.slug, redundant: r.redundant, actual: r.actual });
  }

  const postView = await db.$queryRaw<{ id: string; slug: string; redundant: number; actual: number }[]>`
    SELECT p.id, p.slug,
           p."viewCount"::int AS redundant,
           (SELECT COUNT(*)::int FROM "PostView" v WHERE v."postId" = p.id) AS actual
    FROM "BlogPost" p
    WHERE p."viewCount" <> (SELECT COUNT(*)::int FROM "PostView" v WHERE v."postId" = p.id)
  `;
  for (const r of postView) {
    drift.push({ kind: "post.viewCount", id: r.id, label: r.slug, redundant: r.redundant, actual: r.actual });
  }

  const commentLike = await db.$queryRaw<{ id: string; label: string; redundant: number; actual: number }[]>`
    SELECT c.id, LEFT(c.content, 24) AS label,
           c."likeCount"::int AS redundant,
           (SELECT COUNT(*)::int FROM "CommentLike" cl WHERE cl."commentId" = c.id) AS actual
    FROM "Comment" c
    WHERE c."likeCount" <> (SELECT COUNT(*)::int FROM "CommentLike" cl WHERE cl."commentId" = c.id)
  `;
  for (const r of commentLike) {
    drift.push({ kind: "comment.likeCount", id: r.id, label: r.label, redundant: r.redundant, actual: r.actual });
  }

  return drift;
}

/** 把一条漂移写回为明细实际值 */
async function fixOne(db: PrismaClient, row: DriftRow): Promise<void> {
  switch (row.kind) {
    case "post.likeCount":
      await db.blogPost.update({ where: { id: row.id }, data: { likeCount: row.actual } });
      break;
    case "post.repostCount":
      await db.blogPost.update({ where: { id: row.id }, data: { repostCount: row.actual } });
      break;
    case "post.commentCount":
      await db.blogPost.update({ where: { id: row.id }, data: { commentCount: row.actual } });
      break;
    case "post.viewCount":
      await db.blogPost.update({ where: { id: row.id }, data: { viewCount: row.actual } });
      break;
    case "comment.likeCount":
      await db.comment.update({ where: { id: row.id }, data: { likeCount: row.actual } });
      break;
  }
}

/**
 * 执行对账。
 * @param fix true = 检出后立即修正；false = 只报告（dry-run，默认）
 */
export async function reconcileCounters(
  options: { fix?: boolean } = {},
  db: PrismaClient = defaultPrisma,
): Promise<ReconcileResult> {
  const drift = await detectDrift(db);
  let fixed = 0;
  if (options.fix) {
    for (const row of drift) {
      await fixOne(db, row);
      fixed += 1;
    }
  }
  const scanned = await db.blogPost.count();
  return { scanned, drifted: drift, fixed };
}
