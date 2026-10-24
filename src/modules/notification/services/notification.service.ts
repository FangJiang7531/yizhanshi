import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createNotificationRepository } from "../repositories/notification.repository";

type NotificationTypeCode =
  | "POST_LIKE"
  | "POST_COMMENT"
  | "COMMENT_REPLY"
  | "FOLLOW"
  | "MESSAGE"
  | "SYSTEM";

/**
 * 通知服务：站内通知的统一入口。
 *
 * 关键设计：notify() 是「尽力而为」——通知失败绝不阻断主业务
 * （点赞/评论/关注本身成功），错误只记日志。这是通知系统的行业惯例：
 * 通知是衍生数据，不是交易数据。
 */
export function createNotificationService(db: PrismaClient = defaultPrisma) {
  const repo = createNotificationRepository(db);

  /** 尽力而为写入：失败仅记日志，不抛出 */
  async function safeNotify(data: {
    userId: string;
    actorId?: string | null;
    type: NotificationTypeCode;
    title: string;
    content?: string | null;
    link?: string | null;
  }) {
    try {
      await db.notification.create({
        data: {
          userId: data.userId,
          actorId: data.actorId ?? null,
          type: data.type,
          title: data.title.slice(0, 200),
          content: data.content?.slice(0, 500) ?? null,
          link: data.link?.slice(0, 500) ?? null,
        },
      });
    } catch (err) {
      logger.warn({ module: "notification", err: (err as Error).message }, "通知写入失败（不阻断主业务）");
    }
  }

  return {
    /** 博客文章收到点赞（取消点赞不撤回通知，社交产品通行做法） */
    async notifyPostLiked(params: {
      postAuthorId: string;
      actorId: string;
      actorName: string;
      postSlug: string;
      postTitle: string;
    }) {
      if (params.postAuthorId === params.actorId) return; // 自己赞自己不打扰
      await safeNotify({
        userId: params.postAuthorId,
        actorId: params.actorId,
        type: "POST_LIKE",
        title: `${params.actorName} 赞了你的文章`,
        content: params.postTitle,
        link: `/blog/p/${params.postSlug}`,
      });
    },

    /** 文章收到评论 */
    async notifyPostCommented(params: {
      postAuthorId: string;
      actorId: string;
      actorName: string;
      postSlug: string;
      commentId: string;
      excerpt: string;
    }) {
      if (params.postAuthorId === params.actorId) return;
      await safeNotify({
        userId: params.postAuthorId,
        actorId: params.actorId,
        type: "POST_COMMENT",
        title: `${params.actorName} 评论了你的文章`,
        content: params.excerpt,
        link: `/blog/p/${params.postSlug}#comment-${params.commentId}`,
      });
    },

    /** 评论被回复 */
    async notifyCommentReplied(params: {
      parentAuthorId: string;
      actorId: string;
      actorName: string;
      postSlug: string;
      commentId: string;
      excerpt: string;
    }) {
      if (params.parentAuthorId === params.actorId) return;
      await safeNotify({
        userId: params.parentAuthorId,
        actorId: params.actorId,
        type: "COMMENT_REPLY",
        title: `${params.actorName} 回复了你的评论`,
        content: params.excerpt,
        link: `/blog/p/${params.postSlug}#comment-${params.commentId}`,
      });
    },

    /** 被关注（link 必须用 username——/blog/u/ 路由参数是用户名，displayName 会导致 404） */
    async notifyFollowed(params: {
      targetUserId: string;
      actorId: string;
      actorName: string;
      actorUsername: string;
    }) {
      if (params.targetUserId === params.actorId) return;
      await safeNotify({
        userId: params.targetUserId,
        actorId: params.actorId,
        type: "FOLLOW",
        title: `${params.actorName} 关注了你`,
        link: `/blog/u/${encodeURIComponent(params.actorUsername)}`,
      });
    },

    /** 收到私聊消息（link 用 username） */
    async notifyMessage(params: {
      recipientId: string;
      senderId: string;
      senderName: string;
      senderUsername: string;
    }) {
      if (params.recipientId === params.senderId) return;
      await safeNotify({
        userId: params.recipientId,
        actorId: params.senderId,
        type: "MESSAGE",
        title: `${params.senderName} 给你发来消息`,
        link: `/messages?with=${encodeURIComponent(params.senderUsername)}`,
      });
    },

    /** 系统通知（管理员发送 / 系统事件） */
    async notifySystem(params: { userId: string; title: string; content?: string; link?: string }) {
      await safeNotify({
        userId: params.userId,
        type: "SYSTEM",
        title: params.title,
        content: params.content ?? null,
        link: params.link ?? null,
      });
    },

    /** 举报转达给全体管理员 */
    async notifyAdminsReport(params: {
      reporterName: string;
      targetUsername: string;
      reason: string;
    }) {
      const admins = await db.user.findMany({
        where: { role: "ADMIN", status: "ACTIVE" },
        select: { id: true },
      });
      await Promise.all(
        admins.map((a) =>
          safeNotify({
            userId: a.id,
            type: "SYSTEM",
            title: `用户举报：${params.targetUsername}`,
            content: `${params.reporterName} 举报理由：${params.reason}`,
            link: `/blog/u/${params.targetUsername}`,
          }),
        ),
      );
    },

    async list(userId: string, opts: { cursor?: string | null; take: number; unreadOnly?: boolean }) {
      return repo.list(userId, opts);
    },

    async unreadCount(userId: string) {
      return repo.unreadCount(userId);
    },

    async markRead(userId: string, ids: string[]) {
      return repo.markRead(userId, ids);
    },

    async markAllRead(userId: string) {
      return repo.markAllRead(userId);
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
