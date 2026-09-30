"use server";

import { revalidatePath } from "next/cache";
import { getPrincipal } from "@/lib/auth/session";
import { requireNonGuest, requireRole } from "@/lib/auth/guards";
import { fail, ok, NotFoundError, UnauthorizedError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { createCommentSchema, deleteCommentSchema, moderateSchema } from "../schemas";
import { createCommentService } from "../services/comment.service";
import { prisma } from "@/lib/db";
import type { CommentDTO, CommentListDTO, PendingCommentDTO } from "../types";

/**
 * 评论控制器。
 *
 * 读取（list）允许访客与未登录用户 —— 评论是公开内容，但 viewer 状态（是否已赞、能否删）
 * 依赖登录身份，未登录时一律为 false。
 */

const listCommentsSchema = z.object({
  postId: z.string().cuid(),
  sort: z.enum(["new", "hot"]).default("new"),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(20),
});

export async function listCommentsAction(raw: unknown): Promise<ActionResult<CommentListDTO>> {
  try {
    const data = listCommentsSchema.parse(raw);
    const principal = await getPrincipal();
    const viewer =
      principal && !("guest" in principal)
        ? { userId: principal.user.id, isAdmin: principal.user.role === "ADMIN" }
        : { userId: null, isAdmin: false };

    const service = createCommentService();
    const result = await service.list(data.postId, viewer, {
      sort: data.sort,
      cursor: data.cursor,
      take: data.take,
    });
    return ok(result);
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "listCommentsAction");
    return fail(err);
  }
}

export async function createCommentAction(raw: unknown): Promise<ActionResult<CommentDTO>> {
  try {
    const user = await requireNonGuest();
    const data = createCommentSchema.parse(raw);
    const service = createCommentService();
    const comment = await service.create(user.id, data, { isAdmin: user.role === "ADMIN" });

    // 评论是详情页的一部分，需要失效对应 slug 的缓存
    const post = await prisma.blogPost.findUnique({ where: { id: data.postId }, select: { slug: true } });
    if (post) revalidatePath(`/blog/p/${post.slug}`);

    return ok(comment);
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "createCommentAction");
    return fail(err);
  }
}

export async function deleteCommentAction(raw: unknown): Promise<ActionResult<{ deleted: true; cascade: number }>> {
  try {
    const user = await requireNonGuest();
    const data = deleteCommentSchema.parse(raw);
    const service = createCommentService();
    const result = await service.remove(user.id, data.id, { isAdmin: user.role === "ADMIN" });
    return ok(result);
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "deleteCommentAction");
    return fail(err);
  }
}

/** 待审评论队列（ADMIN） */
export async function listPendingCommentsAction(): Promise<ActionResult<PendingCommentDTO[]>> {
  try {
    await requireRole("ADMIN");
    const service = createCommentService();
    return ok(await service.listPending());
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "listPendingCommentsAction");
    return fail(err);
  }
}

export async function reviewCommentAction(
  raw: unknown,
): Promise<ActionResult<{ reviewed: true }>> {
  try {
    await requireRole("ADMIN");
    const data = moderateSchema.parse(raw);
    // 评论复核后要重算文章评论数，因此先从评论反查 postId
    const comment = await prisma.comment.findUnique({ where: { id: data.id }, select: { postId: true } });
    if (!comment) throw new NotFoundError("评论不存在");
    const service = createCommentService();
    const result = await service.review(comment.postId, data.id, data.action);
    return ok(result);
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "reviewCommentAction");
    return fail(err);
  }
}

/** 供未登录用户判断是否需要弹出"登录后才能互动"的说明对话框（A-18） */
export async function getInteractionCapabilityAction(): Promise<
  ActionResult<{ canInteract: boolean; reason: string | null }>
> {
  try {
    const principal = await getPrincipal();
    if (!principal) return fail(new UnauthorizedError());
    if ("guest" in principal) {
      return ok({ canInteract: false, reason: "访客模式下无法互动，注册账号即可点赞、转发与评论" });
    }
    return ok({ canInteract: true, reason: null });
  } catch (err) {
    return fail(err);
  }
}
