"use server";

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
    return ok(await followService.toggle(user.id, data.username));
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
