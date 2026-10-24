import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { env } from "@/config/env";
import { storage } from "@/lib/storage";
import { ContentRejectedError, NotFoundError, RateLimitError, ValidationError } from "@/lib/errors";
import { ensureSensitiveWordsLoaded, sensitiveFilter } from "@/modules/blog/lib/sensitive-filter";
import { createNotificationService } from "./notification.service";

/**
 * 私聊服务：会话 + 消息。
 *
 * 内容规范（用户要求 §2）：
 * - 文字走违禁词引擎（BLOCK 拒绝；REVIEW/MASK 词打码后放行）；
 * - 图片仅允许白名单 MIME（jpeg/png/webp/gif），大小上限与博客插图一致；
 * - 发送限流：每会话 30 条/分钟。
 */

const MESSAGE_RATE_LIMIT = 30;
const MESSAGE_RATE_WINDOW_MS = 60_000;

/** 图片白名单（与博客插图口径一致） */
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type MessageDTO = {
  id: string;
  mine: boolean;
  content: string | null;
  imageUrl: string | null;
  createdAt: string;
};

export type ConversationDTO = {
  id: string;
  peer: { username: string; displayName: string | null; avatarUrl: string | null };
  lastMessageAt: string;
  lastPreview: string;
  unread: number;
};

export function createMessageService(db: PrismaClient = defaultPrisma) {
  const notifier = createNotificationService(db);

  /** 规范校验：BLOCK 拒绝；其余打码放行。返回安全文本 */
  function sanitizeText(text: string): string {
    const hits = sensitiveFilter.scan(text);
    const blocked = hits.filter((h) => h.level === "BLOCK");
    if (blocked.length > 0) {
      throw new ContentRejectedError(blocked, "消息包含违禁词，无法发送");
    }
    if (hits.length === 0) return text;
    // MASK/REVIEW 命中打码（保留首字符）
    let out = text;
    for (const h of hits) {
      const masked = h.matched.slice(0, 1) + "*".repeat(Math.max(1, h.matched.length - 1));
      out = out.slice(0, h.start) + masked + out.slice(h.end);
    }
    return out;
  }

  /** 幂等获取或创建会话（发起者恒为 userA） */
  async function getOrCreateConversation(userAId: string, userBId: string): Promise<string> {
    const existing = await db.conversation.findFirst({
      where: {
        OR: [
          { userAId, userBId },
          { userAId: userBId, userBId: userAId },
        ],
      },
      select: { id: true },
    });
    if (existing) return existing.id;
    try {
      const created = await db.conversation.create({ data: { userAId, userBId }, select: { id: true } });
      return created.id;
    } catch {
      // 并发创建（双向同时发起）命中唯一约束：读回已存在的那条
      const again = await db.conversation.findFirst({
        where: {
          OR: [
            { userAId, userBId },
            { userAId: userBId, userBId: userAId },
          ],
        },
        select: { id: true },
      });
      if (!again) throw new NotFoundError("会话不存在");
      return again.id;
    }
  }

  async function peerIdOf(conversationId: string, userId: string): Promise<string | null> {
    const conv = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { userAId: true, userBId: true },
    });
    if (!conv) return null;
    if (conv.userAId !== userId && conv.userBId !== userId) return null; // 非会话成员
    return conv.userAId === userId ? conv.userBId : conv.userAId;
  }

  return {
    /** 会话列表（按最近消息排序），附带未读数 */
    async listConversations(userId: string): Promise<ConversationDTO[]> {
      const convs = await db.conversation.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        orderBy: { lastMessageAt: "desc" },
        take: 50,
        include: {
          userA: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          userB: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, imageUrl: true, senderId: true },
          },
        },
      });
      const unreadRows = await db.directMessage.groupBy({
        by: ["conversationId"],
        where: {
          conversationId: { in: convs.map((c) => c.id) },
          senderId: { not: userId },
          readAt: null,
        },
        _count: { _all: true },
      });
      const unreadMap = new Map(unreadRows.map((r) => [r.conversationId, r._count._all]));

      return convs.map((c) => {
        const peer = c.userAId === userId ? c.userB : c.userA;
        const last = c.messages[0];
        return {
          id: c.id,
          peer: { username: peer.username, displayName: peer.displayName, avatarUrl: peer.avatarUrl },
          lastMessageAt: c.lastMessageAt.toISOString(),
          lastPreview: last
            ? last.imageUrl
              ? "[图片]"
              : (last.content?.slice(0, 40) ?? "")
            : "开始对话吧",
          unread: unreadMap.get(c.id) ?? 0,
        };
      });
    },

    /** 与指定用户的消息（游标倒序取回后正序返回）+ 标记对方消息已读 */
    async listMessages(userId: string, peerUsername: string, opts: { cursor?: string | null; take?: number }) {
      const peer = await db.user.findUnique({
        where: { username: peerUsername },
        select: { id: true, username: true, displayName: true, avatarUrl: true, status: true },
      });
      if (!peer || peer.status === "DELETED") throw new NotFoundError("用户不存在");

      const take = opts.take ?? 30;
      const convId = await getOrCreateConversation(userId, peer.id);

      const rows = await db.directMessage.findMany({
        where: { conversationId: convId },
        orderBy: { createdAt: "desc" },
        take: take + 1,
        ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      });
      const hasMore = rows.length > take;
      const page = (hasMore ? rows.slice(0, take) : rows).reverse();

      // 进入会话即把对方发来的未读全部置为已读
      await db.directMessage.updateMany({
        where: { conversationId: convId, senderId: peer.id, readAt: null },
        data: { readAt: new Date() },
      });

      return {
        conversationId: convId,
        peer: { username: peer.username, displayName: peer.displayName, avatarUrl: peer.avatarUrl },
        items: page.map<MessageDTO>((m) => ({
          id: m.id,
          mine: m.senderId === userId,
          content: m.content,
          imageUrl: m.imageUrl,
          createdAt: m.createdAt.toISOString(),
        })),
        nextCursor: hasMore ? (page[0]?.id ?? null) : null,
      };
    },

    /** 发送文字消息 */
    async sendText(userId: string, peerUsername: string, rawContent: string): Promise<MessageDTO> {
      await ensureSensitiveWordsLoaded();
      const peer = await db.user.findUnique({ where: { username: peerUsername }, select: { id: true, username: true, displayName: true } });
      if (!peer) throw new NotFoundError("用户不存在");
      if (peer.id === userId) throw new ValidationError({ to: ["不能给自己发私信"] }, "不能给自己发私信");

      // 限流
      const since = new Date(Date.now() - MESSAGE_RATE_WINDOW_MS);
      const recent = await db.directMessage.count({
        where: { senderId: userId, conversation: { OR: [{ userAId: userId }, { userBId: userId }] }, createdAt: { gte: since } },
      });
      if (recent >= MESSAGE_RATE_LIMIT) throw new RateLimitError("发送太频繁，请稍后再试");

      const content = sanitizeText(rawContent.trim());
      const convId = await getOrCreateConversation(userId, peer.id);
      const msg = await db.directMessage.create({
        data: { conversationId: convId, senderId: userId, content },
      });
      await db.conversation.update({ where: { id: convId }, data: { lastMessageAt: new Date() } });

      const me = await db.user.findUnique({ where: { id: userId }, select: { username: true, displayName: true } });
      await notifier.notifyMessage({
        recipientId: peer.id,
        senderId: userId,
        senderName: me?.displayName ?? me?.username ?? "有人",
      });

      return {
        id: msg.id,
        mine: true,
        content: msg.content,
        imageUrl: null,
        createdAt: msg.createdAt.toISOString(),
      };
    },

    /** 发送图片消息（校验 MIME/大小后落存储） */
    async sendImage(userId: string, peerUsername: string, file: File): Promise<MessageDTO> {
      const peer = await db.user.findUnique({ where: { username: peerUsername }, select: { id: true } });
      if (!peer) throw new NotFoundError("用户不存在");
      if (peer.id === userId) throw new ValidationError({ to: ["不能给自己发私信"] }, "不能给自己发私信");

      if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
        throw new ValidationError({ file: ["仅支持 JPEG / PNG / WebP / GIF 图片"] }, "图片格式不支持");
      }
      const maxBytes = env.BLOG_IMAGE_MAX_SIZE_MB * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new ValidationError({ file: [`图片不能超过 ${env.BLOG_IMAGE_MAX_SIZE_MB}MB`] }, "图片过大");
      }

      const buf = Buffer.from(await file.arrayBuffer());
      const ext = file.type === "image/gif" ? "gif" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const key = `chat/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
      await storage.put(key, buf, file.type);

      const convId = await getOrCreateConversation(userId, peer.id);
      const msg = await db.directMessage.create({
        data: { conversationId: convId, senderId: userId, imageUrl: `/api/files/${key}` },
      });
      await db.conversation.update({ where: { id: convId }, data: { lastMessageAt: new Date() } });

      const me = await db.user.findUnique({ where: { id: userId }, select: { username: true, displayName: true } });
      await notifier.notifyMessage({
        recipientId: peer.id,
        senderId: userId,
        senderName: me?.displayName ?? me?.username ?? "有人",
      });

      return {
        id: msg.id,
        mine: true,
        content: null,
        imageUrl: msg.imageUrl,
        createdAt: msg.createdAt.toISOString(),
      };
    },

    /** 未读私聊总数（角标聚合） */
    async totalUnread(userId: string): Promise<number> {
      const rows = await db.directMessage.groupBy({
        by: ["conversationId"],
        where: { senderId: { not: userId }, readAt: null, conversation: { OR: [{ userAId: userId }, { userBId: userId }] } },
        _count: { _all: true },
      });
      return rows.reduce((sum, r) => sum + r._count._all, 0);
    },

    /** 上传校验后的会话成员检查（供文件 API 层复用） */
    peerIdOf,
  };
}

export type MessageService = ReturnType<typeof createMessageService>;
