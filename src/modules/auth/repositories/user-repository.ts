import type { PrismaClient, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

/**
 * 用户仓储层。供认证服务使用；其他模块禁止直接导入本文件（跨模块走 services）。
 */
export function createUserRepository(db: PrismaClient = defaultPrisma) {
  return {
    findByUsername(usernameLower: string) {
      return db.user.findUnique({ where: { username: usernameLower } });
    },
    findByEmail(emailLower: string) {
      return db.user.findUnique({ where: { email: emailLower } });
    },
    findByIdentifier(identifierLower: string) {
      return db.user.findFirst({
        where: { OR: [{ username: identifierLower }, { email: identifierLower }] },
      });
    },
    createWithSetting(data: {
      username: string;
      email: string;
      passwordHash: string;
      timezone?: string;
    }) {
      return db.user.create({
        data: {
          username: data.username,
          email: data.email,
          passwordHash: data.passwordHash,
          emailVerifiedAt: new Date(),
          ...(data.timezone ? { timezone: data.timezone } : {}),
          setting: { create: {} },
        },
        include: { setting: true },
      });
    },
    touchLogin(id: string) {
      return db.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
    },
    /** 用户名/邮箱是否已被占用（排除指定用户自身） */
    existsConflict(params: { username?: string; email?: string; excludeUserId?: string }) {
      const where: Prisma.UserWhereInput = {
        OR: [
          ...(params.username ? [{ username: params.username }] : []),
          ...(params.email ? [{ email: params.email }] : []),
        ],
        ...(params.excludeUserId ? { id: { not: params.excludeUserId } } : {}),
      };
      return db.user.count({ where });
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
