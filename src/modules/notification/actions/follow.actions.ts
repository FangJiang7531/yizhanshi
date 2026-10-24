"use server";

import { revalidatePath } from "next/cache";
import { requireNonGuest } from "@/lib/auth/guards";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createFollowService } from "../services/follow.service";
import { followSchema } from "../schemas";

/** 关注控制器 */

export async function toggleFollowAction(
  raw: unknown,
): Promise<ActionResult<{ following: boolean }>> {
  try {
    const user = await requireNonGuest();
    const data = followSchema.parse(raw);
    const followService = createFollowService();
    const result = await followService.toggle(user.id, data.username);
    // 双方空间页统计即时可见（对方粉丝数 / 我的关注数立即生效）
    revalidatePath(`/blog/u/${data.username}`);
    revalidatePath("/space");
    return ok(result);
  } catch (err) {
    logger.warn({ module: "notification", err: (err as Error).message }, "toggleFollowAction");
    return fail(err);
  }
}

export async function isFollowingAction(
  raw: unknown,
): Promise<ActionResult<{ following: boolean }>> {
  try {
    const user = await requireNonGuest();
    const data = followSchema.parse(raw);
    const followService = createFollowService();
    return ok({ following: await followService.isFollowing(user.id, data.username) });
  } catch {
    // 未登录/访客：默认未关注
    return ok({ following: false });
  }
}

/** 关注列表（TA 关注的人） */
export async function listFollowingAction(
  raw: unknown,
): Promise<ActionResult<{ items: { username: string; displayName: string | null; avatarUrl: string | null }[] }>> {
  try {
    await requireNonGuest();
    const data = followSchema.parse(raw);
    const followService = createFollowService();
    return ok({ items: await followService.listFollowing(data.username) });
  } catch (err) {
    logger.warn({ module: "notification", err: (err as Error).message }, "listFollowingAction");
    return fail(err);
  }
}

/** 粉丝列表 */
export async function listFollowersAction(
  raw: unknown,
): Promise<ActionResult<{ items: { username: string; displayName: string | null; avatarUrl: string | null }[] }>> {
  try {
    await requireNonGuest();
    const data = followSchema.parse(raw);
    const followService = createFollowService();
    return ok({ items: await followService.listFollowers(data.username) });
  } catch (err) {
    logger.warn({ module: "notification", err: (err as Error).message }, "listFollowersAction");
    return fail(err);
  }
}
