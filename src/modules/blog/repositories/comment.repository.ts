import type { Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";

/**
 * 评论仓储层（制作流程 Step 2.2）。
 *
 * 两级楼中楼：数据库层面 parentId 只允许指向**顶层评论**，
 * 写入时若父级本身是回复，自动上提到其顶层祖先 → 深度恒 ≤2（B-06）。
 * 软删除保留"该评论已删除"占位，避免楼层错乱（B-08）。
 */

const COMMENT_INCLUDE = {
  user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
} satisfies Prisma.CommentInclude;

/**
 * 列表可见性：已通过审核的评论才对外展示。
 * 注意这里**不过滤 deletedAt** —— 软删除的评论要以"该评论已删除"占位保留楼层，
 * 否则楼层会错乱（PRD §5.6）。
 */
const VISIBLE_COMMENT: Prisma.CommentWhereInput = { status: "APPROVED" };

/**
 * 计数口径：与 `BlogPost.commentCount` 严格一致（不含软删占位），
 * 否则列表页的"共 N 条评论"会与文章卡片上的评论数对不上。
 */
const COUNTABLE_COMMENT: Prisma.CommentWhereInput = { status: "APPROVED", deletedAt: null };

type Db = Prisma.TransactionClient;

export function createCommentRepository(db: Db = defaultPrisma) {
  return {
    /**
     * 两级楼中楼的父级解析（写入时执行）。
     * - parentId 为空 → 顶层评论（返回 null）
     * - 父级存在且本身是顶层 → 挂在它下面
     * - 父级本身是回复 → 上提到它的顶层祖先，保证深度恒 ≤2
     */
    async resolveParent(postId: string, parentId?: string | null): Promise<string | null> {
      if (!parentId) return null;
      const parent = await db.comment.findFirst({
        where: { id: parentId, postId },
        select: { id: true, parentId: true },
      });
      if (!parent) throw new NotFoundError("父评论不存在");
      return parent.parentId ?? parent.id;
    },

    /** 顶层评论（分页；"最新"= 创建时间倒序，"最热"= 点赞倒序） */
    async listTopLevel(postId: string, opts: { sort: "new" | "hot"; cursor?: string; take: number }) {
      const take = opts.take;
      const items = await db.comment.findMany({
        where: { postId, parentId: null, ...VISIBLE_COMMENT },
        include: COMMENT_INCLUDE,
        orderBy:
          opts.sort === "hot"
            ? [{ likeCount: "desc" }, { createdAt: "desc" }, { id: "desc" }]
            : [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      });
      const hasMore = items.length > take;
      const page = hasMore ? items.slice(0, take) : items;
      return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
    },

    /** 取某批顶层评论的全部回复（一次查回，避免 N+1；按时间正序便于楼层阅读） */
    listReplies(parentIds: string[]) {
      if (parentIds.length === 0) return Promise.resolve([]);
      return db.comment.findMany({
        where: { parentId: { in: parentIds }, ...VISIBLE_COMMENT },
        include: COMMENT_INCLUDE,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
    },

    /** 可计数评论数（不含软删占位；与 BlogPost.commentCount 同口径） */
    countVisible(postId: string) {
      return db.comment.count({ where: { postId, ...COUNTABLE_COMMENT } });
    },

    /**
     * SSE 增量：晚于 since 的可见评论（含回复与软删占位——占位也要推送，
     * 否则实时流里的楼层状态会和列表页漂移）。游标是 createdAt（毫秒精度）。
     */
    listNewSince(postId: string, since: Date, take: number) {
      return db.comment.findMany({
        where: { postId, ...VISIBLE_COMMENT, createdAt: { gt: since } },
        include: COMMENT_INCLUDE,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take,
      });
    },

    findById(id: string) {
      return db.comment.findFirst({ where: { id }, include: COMMENT_INCLUDE });
    },

    /** 创建评论（parentId 必须已由 resolveParent 归一化为顶层） */
    create(
      userId: string,
      data: {
        postId: string;
        parentId: string | null;
        content: string;
        status: "PENDING" | "APPROVED";
        auditStatus: "PENDING" | "PASSED" | "REJECTED";
      },
    ) {
      return db.comment.create({
        data: {
          postId: data.postId,
          userId,
          parentId: data.parentId,
          content: data.content,
          status: data.status,
          auditStatus: data.auditStatus,
        },
        include: COMMENT_INCLUDE,
      });
    },

    /**
     * 软删除。普通用户仅能删自己的；管理员可删他人（C-03）。
     * 权限校验下推到 SQL 的 WHERE，避免"校验与写入之间的竞态窗口"。
     * 删除顶层评论时其全部回复一并软删除（B-08）。
     *
     * 两次写入的原子性由**调用方的事务**保证（comment.service 用 `$transaction` 包裹本方法），
     * 因此本仓储只依赖 `Prisma.TransactionClient`，可在任意事务上下文中复用。
     */
    async softDelete(userId: string, id: string, isAdmin: boolean) {
      const scope: Prisma.CommentWhereInput = isAdmin ? {} : { userId };
      const target = await db.comment.findFirst({
        where: { id, ...scope },
        select: { id: true, parentId: true },
      });
      if (!target) return { count: 0, cascade: 0 };

      const now = new Date();
      const main = await db.comment.updateMany({
        where: { id: target.id, deletedAt: null },
        data: { deletedAt: now },
      });
      // 顶层评论：级联软删其全部回复（回复的回复已不存在，深度 ≤2）
      const cascade =
        target.parentId === null
          ? await db.comment.updateMany({
              where: { parentId: target.id, deletedAt: null },
              data: { deletedAt: now },
            })
          : { count: 0 };
      return { count: main.count, cascade: cascade.count };
    },

    /** 审核状态更新（后台通过/驳回） */
    review(id: string, data: { status: "APPROVED" | "REJECTED"; auditStatus: "PASSED" | "REJECTED" }) {
      return db.comment.updateMany({ where: { id }, data });
    },

    /** 待审评论队列（ADMIN） */
    listPending(take = 50) {
      return db.comment.findMany({
        where: { status: "PENDING", deletedAt: null },
        include: { ...COMMENT_INCLUDE, post: { select: { id: true, slug: true, title: true } } },
        orderBy: { createdAt: "asc" },
        take,
      });
    },

    /** 某用户在某文章的近期评论数（用于限流判定） */
    countRecentByUser(userId: string, postId: string, since: Date) {
      return db.comment.count({ where: { userId, postId, createdAt: { gte: since } } });
    },
  };
}

export type CommentRepository = ReturnType<typeof createCommentRepository>;
