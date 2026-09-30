"use server";

import { headers } from "next/headers";
import { requireNonGuest } from "@/lib/auth/guards";
import { getPrincipal, hashIp } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordViewSchema, repostSchema, shareSchema, toggleCommentLikeSchema, toggleLikeSchema } from "../schemas";
import { createCounterService } from "../services/counter.service";
import { createCommentService } from "../services/comment.service";

/**
 * 互动控制器（点赞 / 转发 / 分享 / 浏览 / 评论点赞）。
 *
 * 点赞与转发是**只写自己的关系记录**，因此不需要 revalidate：
 * 详情页是 SSG + ISR，客户端用乐观更新维护计数，服务端渲染的计数按 ISR 周期自然刷新。
 * 若为一次点赞而 revalidatePath 整个详情页，会把 ISR 的收益全部抵消（每次点赞都触发重渲染）。
 */

export async function toggleLikeAction(raw: unknown): Promise<ActionResult<{ liked: boolean; likeCount: number }>> {
  try {
    const user = await requireNonGuest();
    const data = toggleLikeSchema.parse(raw);
    const counter = createCounterService();
    return ok(await counter.toggleLike(data.postId, user.id));
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "toggleLikeAction");
    return fail(err);
  }
}

export async function toggleRepostAction(
  raw: unknown,
): Promise<ActionResult<{ reposted: boolean; repostCount: number }>> {
  try {
    const user = await requireNonGuest();
    const data = repostSchema.parse(raw);
    const counter = createCounterService();
    const result = await counter.toggleRepost(data.postId, user.id, data.comment || null);
    return ok(result);
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "toggleRepostAction");
    return fail(err);
  }
}

export async function toggleCommentLikeAction(
  raw: unknown,
): Promise<ActionResult<{ liked: boolean; likeCount: number }>> {
  try {
    const user = await requireNonGuest();
    const data = toggleCommentLikeSchema.parse(raw);
    const commentService = createCommentService();
    return ok(await commentService.toggleLike(data.commentId, user.id));
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "toggleCommentLikeAction");
    return fail(err);
  }
}

/** 分享：仅计数，无幂等要求（站外传播行为，与"转发"这个站内社交行为区分） */
export async function shareAction(raw: unknown): Promise<ActionResult<{ shareCount: number }>> {
  try {
    // 依然要求非访客：公开计数接口最容易被脚本刷量，且未登录分享在前端只走
    // navigator.share 不计数（体验不受影响，计数口径更干净）
    await requireNonGuest();
    const data = shareSchema.parse(raw);
    const counter = createCounterService();
    return ok(await counter.incrementShare(data.postId));
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "shareAction");
    return fail(err);
  }
}

/**
 * 浏览记录。**允许访客调用**（浏览公开内容不需要登录），
 * 但仍读取 principal 来决定去重口径：登录用户按 userId 去重（换网络也算同一人），
 * 访客按 IP + UA 去重。取不到 principal 时才回落为匿名哈希。
 * 去重键一律是 sha256(…+ AUTH_SECRET)，不存原始 IP（与 Session.ipHash 一致）。
 */
export async function recordViewAction(raw: unknown): Promise<ActionResult<{ counted: boolean }>> {
  try {
    const principal = await getPrincipal();
    const data = recordViewSchema.parse(raw);

    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
    const ua = h.get("user-agent") ?? "unknown";
    const viewerHash =
      (principal && !("guest" in principal) ? hashIp(`user:${principal.user.id}`) : hashIp(`${ip}|${ua}`)) ?? "anon";

    // 只对"公开可访问"的文章计数：草稿/私密/待审的浏览没有意义
    const commentService = createCommentService();
    await commentService.assertPostCommentable(data.postId);

    const counter = createCounterService();
    const today = new Date();
    const viewDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const result = await counter.recordView(data.postId, viewerHash, viewDate);
    return ok({ counted: result.counted });
  } catch (err) {
    // 浏览失败不该打扰用户：静默失败但记录日志
    logger.warn({ module: "blog", err: (err as Error).message }, "recordViewAction");
    return fail(err);
  }
}
