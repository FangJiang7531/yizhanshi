"use server";

import { requireNonGuest } from "@/lib/auth/guards";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createNotificationService } from "../services/notification.service";
import {
  listNotificationsSchema,
  markAllReadSchema,
  markReadSchema,
  reportUserSchema,
} from "../schemas";

/**
 * 通知中心控制器：角标 / 列表 / 已读。
 * 角标轮询接口同时返回私聊未读数（一次请求喂两个徽标）。
 */

export type BadgeData = { notifications: number; messages: number };

export async function getBadgeAction(): Promise<ActionResult<BadgeData>> {
  try {
    const user = await requireNonGuest();
    const { createMessageService } = await import("../services/message.service");
    const notifier = createNotificationService();
    const messenger = createMessageService();
    const [notifications, messages] = await Promise.all([
      notifier.unreadCount(user.id),
      messenger.totalUnread(user.id),
    ]);
    return ok({ notifications, messages });
  } catch {
    // 未登录/访客：静默返回 0（角标隐藏），不弹错误
    return ok({ notifications: 0, messages: 0 });
  }
}

export async function listNotificationsAction(
  raw: unknown,
): Promise<ActionResult<{ items: NotificationItemDTO[]; nextCursor: string | null }>> {
  try {
    const user = await requireNonGuest();
    const data = listNotificationsSchema.parse(raw);
    const notifier = createNotificationService();
    const page = await notifier.list(user.id, {
      cursor: data.cursor ?? null,
      take: data.take,
      unreadOnly: data.unreadOnly,
    });
    return ok({
      items: page.items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        content: n.content,
        link: n.link,
        read: n.readAt !== null,
        createdAt: n.createdAt.toISOString(),
        actor: n.actor
          ? { username: n.actor.username, displayName: n.actor.displayName, avatarUrl: n.actor.avatarUrl }
          : null,
      })),
      nextCursor: page.nextCursor,
    });
  } catch (err) {
    logger.warn({ module: "notification", err: (err as Error).message }, "listNotificationsAction");
    return fail(err);
  }
}

export async function markReadAction(raw: unknown): Promise<ActionResult<{ marked: number }>> {
  try {
    const user = await requireNonGuest();
    const data = markReadSchema.parse(raw);
    const notifier = createNotificationService();
    return ok({ marked: await notifier.markRead(user.id, data.ids) });
  } catch (err) {
    logger.warn({ module: "notification", err: (err as Error).message }, "markReadAction");
    return fail(err);
  }
}

export async function markAllReadAction(
  _raw: unknown,
): Promise<ActionResult<{ marked: number }>> {
  try {
    const user = await requireNonGuest();
    markAllReadSchema.parse(_raw);
    const notifier = createNotificationService();
    return ok({ marked: await notifier.markAllRead(user.id) });
  } catch (err) {
    logger.warn({ module: "notification", err: (err as Error).message }, "markAllReadAction");
    return fail(err);
  }
}

/** 举报用户：转达管理员 + 给举报人回执 */
export async function reportUserAction(raw: unknown): Promise<ActionResult<{ reported: true }>> {
  try {
    const user = await requireNonGuest();
    const data = reportUserSchema.parse(raw);
    const notifier = createNotificationService();
    await notifier.notifyAdminsReport({
      reporterName: user.displayName ?? user.username,
      targetUsername: data.username,
      reason: data.reason,
    });
    await notifier.notifySystem({
      userId: user.id,
      title: "举报已提交",
      content: `我们已收到你对 ${data.username} 的举报，管理员会尽快核实处理。`,
    });
    return ok({ reported: true });
  } catch (err) {
    logger.warn({ module: "notification", err: (err as Error).message }, "reportUserAction");
    return fail(err);
  }
}

export type NotificationItemDTO = {
  id: string;
  type: "POST_LIKE" | "POST_COMMENT" | "COMMENT_REPLY" | "FOLLOW" | "MESSAGE" | "SYSTEM";
  title: string;
  content: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
  actor: { username: string; displayName: string | null; avatarUrl: string | null } | null;
};
