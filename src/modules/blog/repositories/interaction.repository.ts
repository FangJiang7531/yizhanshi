import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

/**
 * 互动仓储层（制作流程 Step 2.2）。
 *
 * 四条纪律：
 * 1. **幂等**：`like`/`repost` 重复调用不产生重复记录（Gate 2.2 判据 2）；
 * 2. **计数与明细同事务**：杜绝"显示 5 个赞只有 4 条记录"（PRD §4.2 约束 2）；
 * 3. **去重**：浏览按 (postId, viewerHash, viewDate) 三列唯一约束去重（B-07）；
 * 4. 明细表是**真源**，冗余计数可随时由明细重算（对账脚本兜底）。
 *
 * 注意：本仓储的 like/unlike 是"设为已赞/设为未赞"的幂等操作，
 * 面向用户的 toggle 语义由 counter.service 承担并额外做一致性重算。
 */
export function createInteractionRepository(db: PrismaClient = defaultPrisma) {
  return {
    /** 设为已赞（幂等）：仅在真正新增明细时递增计数 */
    async like(postId: string, userId: string) {
      return db.$transaction(async (tx) => {
        const res = await tx.postLike.createMany({ data: [{ postId, userId }], skipDuplicates: true });
        if (res.count > 0) {
          await tx.blogPost.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } });
        }
        return { liked: true, added: res.count > 0 };
      });
    },

    /** 取消点赞（幂等）：仅在真正删除明细时递减计数 */
    async unlike(postId: string, userId: string) {
      return db.$transaction(async (tx) => {
        const res = await tx.postLike.deleteMany({ where: { postId, userId } });
        if (res.count > 0) {
          await tx.blogPost.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } });
        }
        return { liked: false, removed: res.count > 0 };
      });
    },

    /** 转发（幂等，一人一帖一次；转发语 ≤200 字）：重复转发仅更新转发语，不重复计数 */
    async repost(postId: string, userId: string, comment?: string | null) {
      return db.$transaction(async (tx) => {
        const existing = await tx.postRepost.findUnique({ where: { postId_userId: { postId, userId } } });
        await tx.postRepost.upsert({
          where: { postId_userId: { postId, userId } },
          create: { postId, userId, comment: comment ?? null },
          update: { comment: comment ?? null },
        });
        if (!existing) {
          await tx.blogPost.update({ where: { id: postId }, data: { repostCount: { increment: 1 } } });
        }
        return { reposted: true, added: !existing };
      });
    },

    /** 取消转发（幂等） */
    async unrepost(postId: string, userId: string) {
      return db.$transaction(async (tx) => {
        const res = await tx.postRepost.deleteMany({ where: { postId, userId } });
        if (res.count > 0) {
          await tx.blogPost.update({ where: { id: postId }, data: { repostCount: { decrement: 1 } } });
        }
        return { reposted: false, removed: res.count > 0 };
      });
    },

    /** 评论点赞（幂等） */
    async likeComment(commentId: string, userId: string) {
      return db.$transaction(async (tx) => {
        const res = await tx.commentLike.createMany({ data: [{ commentId, userId }], skipDuplicates: true });
        if (res.count > 0) {
          await tx.comment.update({ where: { id: commentId }, data: { likeCount: { increment: 1 } } });
        }
        return { liked: true, added: res.count > 0 };
      });
    },

    /** 取消评论点赞（幂等） */
    async unlikeComment(commentId: string, userId: string) {
      return db.$transaction(async (tx) => {
        const res = await tx.commentLike.deleteMany({ where: { commentId, userId } });
        if (res.count > 0) {
          await tx.comment.update({ where: { id: commentId }, data: { likeCount: { decrement: 1 } } });
        }
        return { liked: false, removed: res.count > 0 };
      });
    },

    /**
     * 浏览记录：(postId, viewerHash, viewDate) 唯一 → 同 IP+UA 同日只计一次（B-07）。
     * viewerHash 为 IP+UA 的哈希，不存原始 IP（与 Session.ipHash 处理方式一致）。
     */
    async recordView(postId: string, viewerHash: string, viewDate: Date) {
      return db.$transaction(async (tx) => {
        const res = await tx.postView.createMany({ data: [{ postId, viewerHash, viewDate }], skipDuplicates: true });
        if (res.count > 0) {
          await tx.blogPost.update({ where: { id: postId }, data: { viewCount: { increment: 1 } } });
        }
        return { counted: res.count > 0 };
      });
    },

    /** 分享：无幂等要求，仅计数 */
    incrementShare(postId: string) {
      return db.blogPost.update({ where: { id: postId }, data: { shareCount: { increment: 1 } } });
    },

    // ───────────────── 读取：当前用户对某文章的互动状态与我的转发列表 ─────────────────

    /** 详情页初始状态（客户端组件再基于此做乐观更新） */
    async viewerState(postId: string, userId: string | null) {
      if (!userId) return { liked: false, reposted: false };
      const [like, repost] = await Promise.all([
        db.postLike.findUnique({ where: { postId_userId: { postId, userId } }, select: { postId: true } }),
        db.postRepost.findUnique({ where: { postId_userId: { postId, userId } }, select: { postId: true } }),
      ]);
      return { liked: Boolean(like), reposted: Boolean(repost) };
    },

    /** 某用户转发过的公开文章（转发者主页 / 个人信息流） */
    async listRepostsByUser(username: string, take = 20) {
      return db.postRepost.findMany({
        where: { user: { username } },
        include: {
          post: {
            include: {
              user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
              tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take,
      });
    },
  };
}

export type InteractionRepository = ReturnType<typeof createInteractionRepository>;
