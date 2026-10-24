import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

/**
 * 通知仓储：所有查询强制带 userId 作用域（接收者）。
 * 聚合查询（未读角标）单独提供，避免 N+1。
 * 注意：返回类型一律让 TS 推断——Prisma 的 Notification 模型与 DOM 全局
 * Notification 同名，显式标注会意外绑定到 DOM 类型。
 */
export function createNotificationRepository(db: PrismaClient = defaultPrisma) {
  return {
    async create(data: {
      userId: string;
      actorId?: string | null;
      type: "POST_LIKE" | "POST_COMMENT" | "COMMENT_REPLY" | "FOLLOW" | "MESSAGE" | "SYSTEM";
      title: string;
      content?: string | null;
      link?: string | null;
    }) {
      return db.notification.create({ data });
    },

    /** 列表（游标分页，按创建时间倒序） */
    async list(
      userId: string,
      opts: { cursor?: string | null; take: number; unreadOnly?: boolean },
    ) {
      const items = await db.notification.findMany({
        where: {
          userId,
          ...(opts.unreadOnly ? { readAt: null } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: opts.take + 1,
        ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
        include: {
          actor: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });
      const hasMore = items.length > opts.take;
      return {
        items: hasMore ? items.slice(0, opts.take) : items,
        nextCursor: hasMore ? (items[opts.take]?.id ?? null) : null,
      };
    },

    /** 未读数（角标，99+ 由展示层截断） */
    async unreadCount(userId: string): Promise<number> {
      return db.notification.count({ where: { userId, readAt: null } });
    },

    async markRead(userId: string, ids: string[]): Promise<number> {
      const r = await db.notification.updateMany({
        where: { userId, id: { in: ids }, readAt: null },
        data: { readAt: new Date() },
      });
      return r.count;
    },

    async markAllRead(userId: string): Promise<number> {
      const r = await db.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
      return r.count;
    },

    /** 清理：保留最近 N 天（复用既有 Job 体系时可调用） */
    async purgeOlderThan(userId: string, days: number): Promise<number> {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const r = await db.notification.deleteMany({
        where: { userId, createdAt: { lt: cutoff }, readAt: { not: null } },
      });
      return r.count;
    },
  };
}

export type NotificationRepository = ReturnType<typeof createNotificationRepository>;
