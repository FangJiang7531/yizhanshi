import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { CommentDisabledError, ContentRejectedError, NotFoundError, PostNotAccessibleError, RateLimitError } from "@/lib/errors";
import { createCommentRepository, type CommentRepository } from "../repositories/comment.repository";
import { createPostRepository } from "../repositories/post.repository";
import { renderCommentMarkdown } from "../lib/markdown";
import { auditSingle, blockHits } from "./audit.service";
import { createCounterService, retryOnWriteConflict, syncPostCommentCount } from "./counter.service";
import { serializeComment, type CommentWithAuthor } from "./dto";
import { createCommentSchema, type CreateCommentInput } from "../schemas";
import type { CommentDTO, CommentListDTO } from "../types";

/**
 * 评论服务（制作流程 Step 3.4 / PRD §5.6）。
 *
 * 两级楼中楼：顶层评论 + 回复；回复的回复在写入时被上提到顶层（深度恒 ≤2）。
 * 列表组装一次查回顶层与全部回复，避免 N+1。
 */

/** 限流参数（PRD §6.5 / C-08：连续第 11 条返回 429） */
const COMMENT_RATE_LIMIT = 10;
const COMMENT_RATE_WINDOW_MS = 60_000;
/** 单条评论最多允许的 URL 数（防广告刷屏） */
const MAX_URLS_PER_COMMENT = 2;

const URL_PATTERN = /(https?:\/\/|www\.)/gi;

export type CommentViewer = {
  userId: string | null;
  isAdmin: boolean;
};

export function createCommentService(
  db: PrismaClient = defaultPrisma,
  commentRepo: CommentRepository = createCommentRepository(db),
) {
  const postRepo = createPostRepository(db);
  const counter = createCounterService(db);

  /** 把 Prisma 评论行转成 DTO（含渲染 HTML、点赞状态、可删除判定） */
  async function toDTO(
    comment: CommentWithAuthor,
    ctx: { viewer: CommentViewer; likedIds: Set<string> },
  ): Promise<CommentDTO> {
    const contentHtml = comment.deletedAt ? "" : await renderCommentMarkdown(comment.content);
    return serializeComment(comment, {
      viewerId: ctx.viewer.userId,
      viewerIsAdmin: ctx.viewer.isAdmin,
      liked: ctx.likedIds.has(comment.id),
      contentHtml,
    });
  }

  /** 取当前用户对这批评论的点赞状态（一次查回，避免 N+1） */
  async function likedIdSet(userId: string | null, commentIds: string[]): Promise<Set<string>> {
    if (!userId || commentIds.length === 0) return new Set();
    const rows = await db.commentLike.findMany({
      where: { userId, commentId: { in: commentIds } },
      select: { commentId: true },
    });
    return new Set(rows.map((r) => r.commentId));
  }

  return {
    /**
     * 评论列表：返回两级树。
     * 顶层按 sort 排序并游标分页；回复按时间正序整体挂在各自顶层下。
     */
    async list(
      postId: string,
      viewer: CommentViewer,
      opts: { sort: "new" | "hot"; cursor?: string; take?: number },
    ): Promise<CommentListDTO> {
      const take = opts.take ?? 20;
      const { items: tops, nextCursor } = await commentRepo.listTopLevel(postId, {
        sort: opts.sort,
        cursor: opts.cursor,
        take,
      });
      const replies = await commentRepo.listReplies(tops.map((t) => t.id));
      const [total, likedIds] = await Promise.all([
        commentRepo.countVisible(postId),
        likedIdSet(viewer.userId, [...tops.map((t) => t.id), ...replies.map((r) => r.id)]),
      ]);

      // 先转 DTO，再按 parentId 挂载 —— 深度恒为 2，不需要递归
      const topDTOs = await Promise.all(tops.map((t) => toDTO(t, { viewer, likedIds })));
      const replyDTOs = await Promise.all(replies.map((r) => toDTO(r, { viewer, likedIds })));
      // 用原始行建立 parentId → 回复 DTO 的映射（保持时间正序）
      const replyByParent = new Map<string, CommentDTO[]>();
      replies.forEach((raw, i) => {
        const dto = replyDTOs[i];
        if (!dto || !raw.parentId) return;
        const arr = replyByParent.get(raw.parentId) ?? [];
        arr.push(dto);
        replyByParent.set(raw.parentId, arr);
      });
      for (const top of topDTOs) {
        top.replies = replyByParent.get(top.id) ?? [];
      }

      return { items: topDTOs, total, nextCursor };
    },

    /** 创建评论（含限流、审核、父级上提、计数同事务） */
    async create(
      userId: string,
      rawInput: CreateCommentInput,
      viewer: { isAdmin: boolean },
    ): Promise<CommentDTO> {
      const input = createCommentSchema.parse(rawInput);

      // ① 文章可访问性（未发布/已删除/私密 → 一律视为不存在）
      const post = await postRepo.findPublicById(input.postId);
      if (!post) throw new NotFoundError("文章不存在");

      // ② 作者是否关闭了评论（A-13）
      if (!post.allowComment) throw new CommentDisabledError();

      // ③ 限流：单用户单文章 10 条/分钟
      const since = new Date(Date.now() - COMMENT_RATE_WINDOW_MS);
      const recent = await commentRepo.countRecentByUser(userId, input.postId, since);
      if (recent >= COMMENT_RATE_LIMIT) {
        throw new RateLimitError(`评论太频繁了，请稍后再试（每分钟最多 ${COMMENT_RATE_LIMIT} 条）`);
      }

      // ④ 反广告：单条评论 URL 数量上限
      const urlCount = (input.content.match(URL_PATTERN) ?? []).length;
      if (urlCount > MAX_URLS_PER_COMMENT) {
        throw new ContentRejectedError([], `单条评论最多包含 ${MAX_URLS_PER_COMMENT} 个链接`);
      }

      // ⑤ 内容审核
      const audit = await auditSingle("comment", input.content);
      if (audit.blocked) throw new ContentRejectedError(blockHits(audit));
      const hasReview = audit.hasReview;
      const content = audit.masked.get("comment") ?? input.content;

      // ⑥ 事务：父级上提 + 写入 + 计数同步
      const created = await retryOnWriteConflict(() =>
        db.$transaction(async (tx) => {
          const txComment = createCommentRepository(tx);
          const parentId = await txComment.resolveParent(input.postId, input.parentId);
          const row = await txComment.create(userId, {
            postId: input.postId,
            parentId,
            content,
            status: hasReview ? "PENDING" : "APPROVED",
            auditStatus: hasReview ? "PENDING" : "PASSED",
          });
          await syncPostCommentCount(tx, input.postId);
          return row;
        }),
      );

      const likedIds = await likedIdSet(userId, [created.id]);
      return toDTO(created as CommentWithAuthor, {
        viewer: { userId, isAdmin: viewer.isAdmin },
        likedIds,
      });
    },

    /** 删除评论（本人或管理员）；顶层删除会级联软删其回复（B-08） */
    async remove(
      userId: string,
      commentId: string,
      viewer: { isAdmin: boolean },
    ): Promise<{ deleted: true; cascade: number }> {
      const existing = await commentRepo.findById(commentId);
      if (!existing || existing.deletedAt) throw new NotFoundError("评论不存在");

      const result = await retryOnWriteConflict(() =>
        db.$transaction(async (tx) => {
          const txComment = createCommentRepository(tx);
          const r = await txComment.softDelete(userId, commentId, viewer.isAdmin);
          await syncPostCommentCount(tx, existing.postId);
          return r;
        }),
      );

      if (result.count === 0) throw new NotFoundError("评论不存在或无权删除");
      return { deleted: true, cascade: result.cascade };
    },

    /** 评论点赞切换（复用 counter.service：明细与计数同事务 + 写冲突重试） */
    async toggleLike(commentId: string, userId: string) {
      const comment = await commentRepo.findById(commentId);
      if (!comment || comment.deletedAt) throw new NotFoundError("评论不存在");
      return counter.toggleCommentLike(commentId, userId);
    },

    // ─────────────────────────── 审核队列（ADMIN）───────────────────────────

    listPending() {
      return commentRepo.listPending();
    },

    /** 人工复核评论：通过 → APPROVED；驳回 → REJECTED（不进入计数） */
    async review(postId: string, commentId: string, action: "APPROVE" | "REJECT") {
      const approved = action === "APPROVE";
      await retryOnWriteConflict(() =>
        db.$transaction(async (tx) => {
          const txComment = createCommentRepository(tx);
          await txComment.review(commentId, {
            status: approved ? "APPROVED" : "REJECTED",
            auditStatus: approved ? "PASSED" : "REJECTED",
          });
          await syncPostCommentCount(tx, postId);
        }),
      );
      return { reviewed: true };
    },

    /** 供"评论是否存在且可访问"的快速校验（SSE 与互动组件共用） */
    async assertPostCommentable(postId: string) {
      const post = await postRepo.findPublicById(postId);
      if (!post) throw new PostNotAccessibleError();
      return post;
    },
  };
}

export type CommentService = ReturnType<typeof createCommentService>;
