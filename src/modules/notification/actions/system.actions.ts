"use server";

import { requireNonGuest } from "@/lib/auth/guards";
import { getPrincipal } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { prisma } from "@/lib/db";

/**
 * 用户端系统信息与公告动作：
 * - 系统信息：管理端发送的官方私信（SystemMessage），在私信页「系统信息」栏展示；
 * - 公告：登录用户进入平台时拉取当前生效的弹窗公告。
 */

export type SystemMessageDTO = {
  id: string;
  title: string;
  content: string;
  read: boolean;
  createdAt: string;
};

export async function listSystemMessagesAction(): Promise<ActionResult<SystemMessageDTO[]>> {
  try {
    const user = await requireNonGuest();
    const rows = await prisma.systemMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        read: r.readAt !== null,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    return fail(err);
  }
}

export async function markSystemMessageReadAction(
  raw: { id?: string },
): Promise<ActionResult<{ marked: number }>> {
  try {
    const user = await requireNonGuest();
    const r = await prisma.systemMessage.updateMany({
      where: { userId: user.id, readAt: null, ...(raw?.id ? { id: raw.id } : {}) },
      data: { readAt: new Date() },
    });
    return ok({ marked: r.count });
  } catch (err) {
    return fail(err);
  }
}

export type ActiveAnnouncementDTO = {
  id: string;
  title: string;
  content: string;
  level: "info" | "warning" | "critical";
};

/** 当前生效的弹窗公告（登录/访客均可见公开标题？—— 仅登录用户拉取） */
export async function getActiveAnnouncementAction(): Promise<ActionResult<ActiveAnnouncementDTO | null>> {
  try {
    const principal = await getPrincipal();
    if (!principal) return ok(null);
    const now = new Date();
    const row = await prisma.announcement.findFirst({
      where: {
        active: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return ok(null);
    return ok({
      id: row.id,
      title: row.title,
      content: row.content,
      level: (["info", "warning", "critical"] as const).includes(row.level as "info")
        ? (row.level as "info" | "warning" | "critical")
        : "info",
    });
  } catch {
    return ok(null); // 公告拉取失败静默（不阻断进入平台）
  }
}

/** 未读系统信息数（私信页角标） */
export async function unreadSystemCountAction(): Promise<ActionResult<number>> {
  try {
    const user = await requireNonGuest();
    const count = await prisma.systemMessage.count({ where: { userId: user.id, readAt: null } });
    return ok(count);
  } catch {
    return ok(0);
  }
}
