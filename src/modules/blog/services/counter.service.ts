import type { Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";

/**
 * 计数一致性事务（制作流程 Step 2.3）。
 *
 * 铁律：**冗余计数与明细表必须在同一事务内更新**（PRD §4.2 约束 2）。
 * 更进一步的稳健性来源：每次写入后**由明细表重算计数**而非单纯 increment/decrement。
 * 原因：PostgreSQL 的 `update` 会对 BlogPost 行加写锁，天然形成一个串行化点——
 * 最后取得该行锁并提交的事务，其"重算值"必然等于最终明细数，因此并发下不会漂移。
 * 对账脚本（scripts/reconcile-counters.ts）作为第二道防线。
 *
 * 明细表是真源；冗余计数是可随时重建的派生缓存。
 */

type Tx = Prisma.TransactionClient;

/**
 * 写冲突重试（P2034：deadlock / write conflict）。
 *
 * 点赞与转发是"读-判-写"模式，高并发下 PostgreSQL 可能选择牺牲其中一个事务来打破死锁。
 * 这类失败**是可重试的瞬时错误**，而不是业务失败——直接抛给用户会出现"点了没反应"的体验。
 * 这里做有限次退避重试；重试后仍失败才向上抛（此时确实异常）。
 */
const RETRYABLE_PRISMA_CODES = new Set(["P2034"]);

function isRetryableTxError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && RETRYABLE_PRISMA_CODES.has(code);
}

export async function retryOnWriteConflict<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableTxError(err) || i === attempts - 1) throw err;
      // 指数退避 + 抖动，避免重试风暴
      const delay = 5 * 2 ** i + Math.floor(Math.random() * 5);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

/**
 * 悲观锁 + 重算模式（并发正确性的关键）。
 *
 * **为什么必须在事务开头加 `FOR UPDATE`**：
 * "先 count 再 update 计数"看起来由行锁保护，实际上锁只在 update 那一刻才生效——
 * 事务 B 的 count 可能发生在事务 A 提交之前，读到的就是过期快照，
 * 于是两个事务都把 likeCount 写成 1（丢失更新）。
 *
 * 正确顺序是：**先锁行（串行化点）→ 再改明细 → 再 count → 再写计数**。
 * 这样每个事务真正独占该文章的写路径，count 的结果必然是最终一致的。
 */
async function lockPostRow(tx: Tx, postId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "BlogPost" WHERE id = ${postId} FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError("文章不存在");
}

async function lockCommentRow(tx: Tx, commentId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Comment" WHERE id = ${commentId} FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError("评论不存在");
}

/** 由 PostLike 明细重算 likeCount 并写回 */
async function syncPostLikeCount(tx: Tx, postId: string): Promise<number> {
  const likeCount = await tx.postLike.count({ where: { postId } });
  await tx.blogPost.update({ where: { id: postId }, data: { likeCount } });
  return likeCount;
}

/** 由 PostRepost 明细重算 repostCount 并写回 */
async function syncPostRepostCount(tx: Tx, postId: string): Promise<number> {
  const repostCount = await tx.postRepost.count({ where: { postId } });
  await tx.blogPost.update({ where: { id: postId }, data: { repostCount } });
  return repostCount;
}

/**
 * 由 Comment 明细重算 commentCount（只计"可见"评论：已通过且未软删）并写回。
 * 内部先对文章行加锁 —— 与点赞同理，重算必须在串行化点之后才有意义。
 * 供 comment.service 在自身事务内调用（创建/删除/审核评论后）。
 */
export async function syncPostCommentCount(tx: Tx, postId: string): Promise<number> {
  await lockPostRow(tx, postId);
  const commentCount = await tx.comment.count({
    where: { postId, status: "APPROVED", deletedAt: null },
  });
  await tx.blogPost.update({ where: { id: postId }, data: { commentCount } });
  return commentCount;
}

/** 由 CommentLike 明细重算评论的 likeCount 并写回 */
async function syncCommentLikeCount(tx: Tx, commentId: string): Promise<number> {
  const likeCount = await tx.commentLike.count({ where: { commentId } });
  await tx.comment.update({ where: { id: commentId }, data: { likeCount } });
  return likeCount;
}

export function createCounterService(db = defaultPrisma) {
  return {
    /**
     * 查询当前用户对某文章的互动状态（详情页互动栏挂载时用）。
     * 与 toggle* 的 toggle 语义配套：UI 需要"已赞/已转发"初态才能渲染正确。
     */
    async getMyReactions(postId: string, userId: string) {
      const [like, repost] = await Promise.all([
        db.postLike.findFirst({ where: { postId, userId }, select: { userId: true } }),
        db.postRepost.findFirst({ where: { postId, userId }, select: { userId: true } }),
      ]);
      return { liked: like !== null, reposted: repost !== null };
    },

    /**
     * 点赞切换（幂等 + 计数同事务）。
     * 语义为 toggle：已赞则取消，未赞则点赞。并发多次调用时计数始终自洽。
     */
    async toggleLike(postId: string, userId: string) {
      return retryOnWriteConflict(() =>
        db.$transaction(async (tx) => {
          await lockPostRow(tx, postId); // 串行化点：先锁行，再改明细，最后重算
          // 优先尝试插入（ON CONFLICT DO NOTHING）；插不进去说明已存在 → 本次视为取消
          const inserted = await tx.postLike.createMany({
            data: [{ postId, userId }],
            skipDuplicates: true,
          });
          if (inserted.count === 0) {
            await tx.postLike.deleteMany({ where: { postId, userId } });
          }
          const likeCount = await syncPostLikeCount(tx, postId);
          return { liked: inserted.count > 0, likeCount };
        }),
      );
    },

    /** 转发切换（幂等，一人一帖一次；可附转发语） */
    async toggleRepost(postId: string, userId: string, comment?: string | null) {
      return retryOnWriteConflict(() =>
        db.$transaction(async (tx) => {
          await lockPostRow(tx, postId);
          // 用 createMany + skipDuplicates 而非 create：并发下"先查再插"会撞唯一约束（P2002）
          const inserted = await tx.postRepost.createMany({
            data: [{ postId, userId, comment: comment ?? null }],
            skipDuplicates: true,
          });
          if (inserted.count === 0) {
            await tx.postRepost.deleteMany({ where: { postId, userId } });
          }
          const repostCount = await syncPostRepostCount(tx, postId);
          return { reposted: inserted.count > 0, repostCount };
        }),
      );
    },

    /** 评论点赞切换（幂等 + 计数同事务） */
    async toggleCommentLike(commentId: string, userId: string) {
      return retryOnWriteConflict(() =>
        db.$transaction(async (tx) => {
          await lockCommentRow(tx, commentId);
          const inserted = await tx.commentLike.createMany({
            data: [{ commentId, userId }],
            skipDuplicates: true,
          });
          if (inserted.count === 0) {
            await tx.commentLike.deleteMany({ where: { commentId, userId } });
          }
          const likeCount = await syncCommentLikeCount(tx, commentId);
          return { liked: inserted.count > 0, likeCount };
        }),
      );
    },

    /**
     * 浏览记录：(postId, viewerHash, viewDate) 唯一 → 同 IP+UA 同日只计一次（B-07）。
     * 计数同样由明细重算，避免并发下 viewCount 漂移。
     */
    async recordView(postId: string, viewerHash: string, viewDate: Date) {
      return retryOnWriteConflict(() =>
        db.$transaction(async (tx) => {
          await lockPostRow(tx, postId);
          const inserted = await tx.postView.createMany({
            data: [{ postId, viewerHash, viewDate }],
            skipDuplicates: true,
          });
          if (inserted.count === 0) return { counted: false as const };
          const viewCount = await tx.postView.count({ where: { postId } });
          await tx.blogPost.update({ where: { id: postId }, data: { viewCount } });
          return { counted: true as const, viewCount };
        }),
      );
    },

    /** 分享：无幂等要求，仅递增（对账不覆盖 shareCount —— 它是纯粹的"动作次数"而非关系数） */
    async incrementShare(postId: string) {
      const res = await db.blogPost.update({ where: { id: postId }, data: { shareCount: { increment: 1 } } });
      return { shareCount: res.shareCount };
    },

    /** 评论创建/删除后同步 commentCount（供 comment.service 在自身事务内调用） */
    syncPostCommentCount,
  };
}

export type CounterService = ReturnType<typeof createCounterService>;
