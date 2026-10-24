import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createNotificationService } from "./notification.service";

/** 关注服务：关注/取关、粉丝与关注列表、我的空间统计 */
export function createFollowService(db: PrismaClient = defaultPrisma) {
  const notifier = createNotificationService(db);

  async function findUserByUsername(username: string) {
    const user = await db.user.findUnique({
      where: { username },
      select: { id: true, username: true, displayName: true },
    });
    if (!user) throw new NotFoundError("用户不存在");
    return user;
  }

  return {
    /** 关注 / 取消关注（幂等切换） */
    async toggle(userId: string, targetUsername: string): Promise<{ following: boolean }> {
      const target = await findUserByUsername(targetUsername);
      if (target.id === userId) {
        throw new ValidationError({ username: ["不能关注自己"] }, "不能关注自己");
      }
      const existing = await db.follow.findUnique({
        where: { followerId_followingId: { followerId: userId, followingId: target.id } },
      });
      if (existing) {
        await db.follow.delete({ where: { followerId_followingId: { followerId: userId, followingId: target.id } } });
        return { following: false };
      }
      await db.follow.create({ data: { followerId: userId, followingId: target.id } });
      const me = await db.user.findUnique({ where: { id: userId }, select: { username: true, displayName: true } });
      await notifier.notifyFollowed({
        targetUserId: target.id,
        actorId: userId,
        actorName: me?.displayName ?? me?.username ?? "有人",
        actorUsername: me?.username ?? "",
      });
      return { following: true };
    },

    /** 我是否关注了某人 */
    async isFollowing(userId: string, targetUsername: string): Promise<boolean> {
      const target = await db.user.findUnique({ where: { username: targetUsername }, select: { id: true } });
      if (!target) return false;
      const row = await db.follow.findUnique({
        where: { followerId_followingId: { followerId: userId, followingId: target.id } },
      });
      return row !== null;
    },

    /** 用户社交统计：关注数 / 粉丝数 / 动态数（已发布文章数） */
    async statsOf(username: string): Promise<{ following: number; followers: number; posts: number }> {
      const user = await db.user.findUnique({ where: { username }, select: { id: true } });
      if (!user) throw new NotFoundError("用户不存在");
      const [following, followers, posts] = await Promise.all([
        db.follow.count({ where: { followerId: user.id } }),
        db.follow.count({ where: { followingId: user.id } }),
        db.blogPost.count({ where: { userId: user.id, status: "PUBLISHED", visibility: "PUBLIC", deletedAt: null } }),
      ]);
      return { following, followers, posts };
    },

    /** 某用户的关注列表（TA 关注的人） */
    async listFollowing(username: string, take = 100) {
      const user = await db.user.findUnique({ where: { username }, select: { id: true } });
      if (!user) throw new NotFoundError("用户不存在");
      const rows = await db.follow.findMany({
        where: { followerId: user.id },
        orderBy: { createdAt: "desc" },
        take,
        include: {
          following: { select: { username: true, displayName: true, avatarUrl: true } },
        },
      });
      return rows.map((r) => ({
        username: r.following.username,
        displayName: r.following.displayName,
        avatarUrl: r.following.avatarUrl,
      }));
    },

    /** 某用户的粉丝列表 */
    async listFollowers(username: string, take = 100) {
      const user = await db.user.findUnique({ where: { username }, select: { id: true } });
      if (!user) throw new NotFoundError("用户不存在");
      const rows = await db.follow.findMany({
        where: { followingId: user.id },
        orderBy: { createdAt: "desc" },
        take,
        include: {
          follower: { select: { username: true, displayName: true, avatarUrl: true } },
        },
      });
      return rows.map((r) => ({
        username: r.follower.username,
        displayName: r.follower.displayName,
        avatarUrl: r.follower.avatarUrl,
      }));
    },
  };
}

export type FollowService = ReturnType<typeof createFollowService>;
