"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db";
import { createAdminService } from "../services/admin.service";
import {
  announcementSchema,
  badgeSchema,
  banUserSchema,
  blockedActionSchema,
  broadcastSchema,
  featureFlagSchema,
  moderationActionSchema,
  systemMessageSchema,
} from "../schemas";

/**
 * 管理端业务动作：每个动作首行 requireAdmin()（独立 AdminSession 守卫），
 * 用户端任何页面/动作都不引用本文件 —— 物理隔离。
 */

export async function adminStatsAction() {
  try {
    await requireAdmin();
    return ok(await createAdminService().stats());
  } catch (err) {
    logger.warn({ module: "admin", err: (err as Error).message }, "adminStatsAction");
    return fail(err);
  }
}

export async function adminListUsersAction(raw: unknown) {
  try {
    await requireAdmin();
    const q = typeof (raw as { q?: string })?.q === "string" ? (raw as { q: string }).q : undefined;
    const status = (raw as { status?: "ALL" | "ACTIVE" | "SUSPENDED" })?.status ?? "ALL";
    return ok(await createAdminService().listUsers({ q, status }));
  } catch (err) {
    logger.warn({ module: "admin", err: (err as Error).message }, "adminListUsersAction");
    return fail(err);
  }
}

export async function adminUserDetailAction(raw: { userId: string }) {
  try {
    await requireAdmin();
    return ok(await createAdminService().getUserDetail(raw.userId));
  } catch (err) {
    logger.warn({ module: "admin", err: (err as Error).message }, "adminUserDetailAction");
    return fail(err);
  }
}

export async function adminSetBannedAction(raw: unknown): Promise<ActionResult<{ banned: boolean }>> {
  try {
    const admin = await requireAdmin();
    const data = banUserSchema.parse(raw);
    const result = await createAdminService().setBanned(admin.id, data.userId, data.banned);
    logger.warn({ module: "admin", target: data.userId, banned: data.banned }, "用户封禁状态变更");
    return ok(result);
  } catch (err) {
    logger.warn({ module: "admin", err: (err as Error).message }, "adminSetBannedAction");
    return fail(err);
  }
}

export async function adminSetBadgeAction(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireAdmin();
    const data = badgeSchema.parse(raw);
    return ok(await createAdminService().setBadge(data.userId, data));
  } catch (err) {
    logger.warn({ module: "admin", err: (err as Error).message }, "adminSetBadgeAction");
    return fail(err);
  }
}

export async function adminRemoveBadgeAction(raw: { userId: string }): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireAdmin();
    return ok(await createAdminService().removeBadge(raw.userId));
  } catch (err) {
    logger.warn({ module: "admin", err: (err as Error).message }, "adminRemoveBadgeAction");
    return fail(err);
  }
}

export async function adminListAnnouncementsAction() {
  try {
    await requireAdmin();
    return ok(await createAdminService().listAnnouncements());
  } catch (err) {
    return fail(err);
  }
}

export async function adminSaveAnnouncementAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const data = announcementSchema.parse(raw);
    const result = await createAdminService().saveAnnouncement(data);
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

export async function adminToggleAnnouncementAction(raw: { id: string; active: boolean }) {
  try {
    await requireAdmin();
    return ok(await createAdminService().toggleAnnouncement(raw.id, raw.active));
  } catch (err) {
    return fail(err);
  }
}

export async function adminDeleteAnnouncementAction(raw: { id: string }) {
  try {
    await requireAdmin();
    return ok(await createAdminService().deleteAnnouncement(raw.id));
  } catch (err) {
    return fail(err);
  }
}

export async function adminListFlagsAction() {
  try {
    await requireAdmin();
    return ok(await createAdminService().listFlags());
  } catch (err) {
    return fail(err);
  }
}

export async function adminSetFlagAction(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireAdmin();
    const data = featureFlagSchema.parse(raw);
    const result = await createAdminService().setFlag(data.key, data.enabled, data.disabledReason);
    revalidatePath("/", "layout");
    logger.info({ module: "admin", key: data.key, enabled: data.enabled }, "功能开关变更");
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

export async function adminSendSystemMessageAction(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireAdmin();
    const data = systemMessageSchema.parse(raw);
    return ok(await createAdminService().sendSystemMessage(data.userId, data.title, data.content));
  } catch (err) {
    return fail(err);
  }
}

export async function adminBroadcastAction(raw: unknown): Promise<ActionResult<{ sent: number }>> {
  try {
    await requireAdmin();
    const data = broadcastSchema.parse(raw);
    const result = await createAdminService().broadcastSystemMessage(data.title, data.content);
    logger.info({ module: "admin", sent: result.sent }, "系统私信广播");
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

export async function adminListBlockedAction(raw: { status?: "pending" | "all" } = {}) {
  try {
    await requireAdmin();
    return ok(await createAdminService().listBlocked(raw.status ?? "pending"));
  } catch (err) {
    return fail(err);
  }
}

export async function adminDismissBlockedAction(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireAdmin();
    const data = blockedActionSchema.parse(raw);
    return ok(await createAdminService().dismissBlocked(data.id));
  } catch (err) {
    return fail(err);
  }
}

/** 待审文章列表（复用博客审核服务，只读） */
export async function adminPendingPostsAction() {
  try {
    await requireAdmin();
    const { createPostService } = await import("@/modules/blog/services/post.service");
    return ok(await createPostService().listModerationQueue());
  } catch (err) {
    return fail(err);
  }
}

/** 审核动作（通过/驳回文章或评论） */
export async function adminModerateAction(raw: unknown): Promise<ActionResult<{ done: true }>> {
  try {
    const admin = await requireAdmin();
    const data = moderationActionSchema.parse(raw);
    if (data.kind === "post") {
      const { createPostService } = await import("@/modules/blog/services/post.service");
      await createPostService().moderate(admin.id, {
        id: data.id,
        action: data.action === "approve" ? "APPROVE" : "REJECT",
        note: data.note,
      });
    } else {
      const { createCommentService } = await import("@/modules/blog/services/comment.service");
      const comment = await prisma.comment.findUnique({ where: { id: data.id }, select: { postId: true } });
      if (!comment) throw new Error("评论不存在");
      await createCommentService().review(comment.postId, data.id, data.action === "approve" ? "APPROVE" : "REJECT");
    }
    revalidatePath("/admin/moderation");
    return ok({ done: true as const });
  } catch (err) {
    logger.warn({ module: "admin", err: (err as Error).message }, "adminModerateAction");
    return fail(err);
  }
}

/** 待审评论列表 */
export async function adminPendingCommentsAction() {
  try {
    await requireAdmin();
    const { createCommentService } = await import("@/modules/blog/services/comment.service");
    return ok(await createCommentService().listPending());
  } catch (err) {
    return fail(err);
  }
}
