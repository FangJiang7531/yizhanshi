import type { PrismaClient, UserStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * 管理服务：用户/封禁/称号/公告/开关/系统私信/统计。
 * 全部由管理端动作调用（前置 requireAdmin），与用户端服务互不复用会话。
 */

export type AdminUserRow = {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  coverImage: string | null;
  role: string;
  status: string;
  timezone: string;
  lastLoginAt: string | null;
  createdAt: string;
  badge: { text: string; color: string; bgColor: string | null; enabled: boolean } | null;
  counts: { posts: number; followers: number; following: number };
};

export function createAdminService(db: PrismaClient = defaultPrisma) {
  return {
    async listUsers(opts: { q?: string; status?: "ALL" | "ACTIVE" | "SUSPENDED"; take?: number }) {
      const take = opts.take ?? 50;
      const q = opts.q?.trim();
      const rows = await db.user.findMany({
        where: {
          ...(opts.status && opts.status !== "ALL" ? { status: opts.status as UserStatus } : {}),
          ...(q
            ? {
                OR: [
                  { username: { contains: q, mode: "insensitive" as const } },
                  { email: { contains: q, mode: "insensitive" as const } },
                  { displayName: { contains: q, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take,
        include: {
          badge: true,
          _count: { select: { posts: true, followerLinks: true, followingLinks: true } },
        },
      });
      return rows.map<AdminUserRow>((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        bio: u.bio,
        coverImage: u.coverImage,
        role: u.role,
        status: u.status,
        timezone: u.timezone,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        badge: u.badge
          ? { text: u.badge.text, color: u.badge.color, bgColor: u.badge.bgColor, enabled: u.badge.enabled }
          : null,
        counts: {
          posts: u._count.posts,
          followers: u._count.followerLinks,
          following: u._count.followingLinks,
        },
      }));
    },

    async getUserDetail(userId: string) {
      const u = await db.user.findUnique({
        where: { id: userId },
        include: {
          badge: true,
          setting: true,
          _count: { select: { posts: true, comments: true, followerLinks: true, followingLinks: true, shortLinks: true, bookmarks: true } },
        },
      });
      if (!u) throw new NotFoundError("用户不存在");
      return {
        id: u.id,
        username: u.username,
        email: u.email,
        emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        bio: u.bio,
        coverImage: u.coverImage,
        role: u.role,
        status: u.status,
        timezone: u.timezone,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        badge: u.badge
          ? { text: u.badge.text, color: u.badge.color, bgColor: u.badge.bgColor, enabled: u.badge.enabled }
          : null,
        counts: {
          posts: u._count.posts,
          comments: u._count.comments,
          followers: u._count.followerLinks,
          following: u._count.followingLinks,
          shortLinks: u._count.shortLinks,
          bookmarks: u._count.bookmarks,
        },
      };
    },

    /** 封禁：状态置 SUSPENDED + 立即吊销其全部用户会话（在线即刻踢出） */
    async setBanned(operatorId: string, userId: string, banned: boolean) {
      if (operatorId === userId) throw new ValidationError({ userId: ["不能封禁自己"] }, "不能封禁自己");
      const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new NotFoundError("用户不存在");
      await db.$transaction([
        db.user.update({
          where: { id: userId },
          data: { status: banned ? "SUSPENDED" : "ACTIVE" },
        }),
        ...(banned ? [db.session.deleteMany({ where: { userId } })] : []),
      ]);
      return { banned };
    },

    /** 设置称号（upsert）；enabled=false 即隐藏（保留配置） */
    async setBadge(userId: string, input: { text: string; color: string; bgColor?: string | null; enabled: boolean }) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new NotFoundError("用户不存在");
      await db.userBadge.upsert({
        where: { userId },
        create: {
          userId,
          text: input.text,
          color: input.color,
          bgColor: input.bgColor ?? null,
          enabled: input.enabled,
        },
        update: {
          text: input.text,
          color: input.color,
          bgColor: input.bgColor ?? null,
          enabled: input.enabled,
        },
      });
      return { ok: true as const };
    },

    async removeBadge(userId: string) {
      await db.userBadge.deleteMany({ where: { userId } });
      return { ok: true as const };
    },

    // ── 公告 ──
    async listAnnouncements() {
      const rows = await db.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
      return rows.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        level: a.level,
        active: a.active,
        startsAt: a.startsAt?.toISOString() ?? null,
        endsAt: a.endsAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      }));
    },

    async saveAnnouncement(input: {
      id?: string;
      title: string;
      content: string;
      level: "info" | "warning" | "critical";
      active: boolean;
    }) {
      if (input.id) {
        await db.announcement.update({
          where: { id: input.id },
          data: { title: input.title, content: input.content, level: input.level, active: input.active },
        });
        return { id: input.id };
      }
      const created = await db.announcement.create({
        data: { title: input.title, content: input.content, level: input.level, active: input.active },
      });
      return { id: created.id };
    },

    async toggleAnnouncement(id: string, active: boolean) {
      await db.announcement.update({ where: { id }, data: { active } });
      return { ok: true as const };
    },

    async deleteAnnouncement(id: string) {
      await db.announcement.delete({ where: { id } });
      return { ok: true as const };
    },

    // ── 功能开关 ──
    async listFlags() {
      return db.featureFlag.findMany({ orderBy: { key: "asc" } });
    },

    async setFlag(key: string, enabled: boolean, disabledReason?: string) {
      await db.featureFlag.upsert({
        where: { key },
        create: { key, enabled, disabledReason: disabledReason ?? null },
        update: { enabled, disabledReason: disabledReason ?? null },
      });
      return { ok: true as const };
    },

    // ── 系统私信 ──
    async sendSystemMessage(userId: string, title: string, content: string) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new NotFoundError("用户不存在");
      await db.systemMessage.create({ data: { userId, title, content } });
      return { ok: true as const };
    },

    /** 全员广播系统私信（分批写入） */
    async broadcastSystemMessage(title: string, content: string) {
      const users = await db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
      const BATCH = 200;
      for (let i = 0; i < users.length; i += BATCH) {
        await db.systemMessage.createMany({
          data: users.slice(i, i + BATCH).map((u) => ({ userId: u.id, title, content })),
        });
      }
      return { sent: users.length };
    },

    // ── 阻断记录 ──
    async listBlocked(status: "pending" | "all" = "pending") {
      const rows = await db.blockedContent.findMany({
        where: status === "all" ? {} : { status },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { user: { select: { username: true, displayName: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        content: r.content,
        matchedWords: r.matchedWords,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        author: r.user.displayName ?? r.user.username,
      }));
    },

    async dismissBlocked(id: string) {
      await db.blockedContent.update({ where: { id }, data: { status: "dismissed" } });
      return { ok: true as const };
    },

    /** 记录一条阻断内容（供用户端动作在内容被拦截时调用） */
    async recordBlocked(userId: string, kind: "post" | "comment" | "message", content: string, matchedWords: string[]) {
      await db.blockedContent.create({
        data: {
          userId,
          kind,
          content: content.slice(0, 2000),
          matchedWords: matchedWords.slice(0, 20),
        },
      });
    },

    // ── 概览统计 ──
    async stats() {
      const now = new Date();
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [
        users,
        activeUsers,
        suspended,
        posts,
        pendingPosts,
        pendingComments,
        blocked,
        announcements,
        activeAnnouncements,
        newUsers24h,
        badges,
      ] = await Promise.all([
        db.user.count(),
        db.user.count({ where: { status: "ACTIVE" } }),
        db.user.count({ where: { status: "SUSPENDED" } }),
        db.blogPost.count(),
        db.blogPost.count({ where: { status: "REVIEW" } }),
        db.comment.count({ where: { status: "PENDING" } }),
        db.blockedContent.count({ where: { status: "pending" } }),
        db.announcement.count(),
        db.announcement.count({ where: { active: true } }),
        db.user.count({ where: { createdAt: { gte: dayAgo } } }),
        db.userBadge.count({ where: { enabled: true } }),
      ]);
      return {
        users,
        activeUsers,
        suspended,
        posts,
        pendingPosts,
        pendingComments,
        blocked,
        announcements,
        activeAnnouncements,
        newUsers24h,
        badges,
        now: now.toISOString(),
      };
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
