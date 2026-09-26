import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

/** 标签仓储层（纪律：首参 userId）。删除语义：只解除关联，不删除任务。 */
export function createTagRepository(db: PrismaClient = defaultPrisma) {
  return {
    listByUser(userId: string) {
      return db.tag.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, color: true },
      });
    },

    /** 校验 tagIds 全部属于该用户（防跨用户挂标签） */
    async countOwned(userId: string, tagIds: string[]) {
      return db.tag.count({ where: { id: { in: tagIds }, userId } });
    },

    create(userId: string, data: { name: string; color: string }) {
      return db.tag.create({ data: { ...data, userId }, select: { id: true, name: true, color: true } });
    },

    /** 删除标签：TaskTag 关联级联删除，任务本身保留 */
    delete(userId: string, tagId: string) {
      return db.tag.deleteMany({ where: { id: tagId, userId } });
    },

    findByNames(userId: string, names: string[]) {
      return db.tag.findMany({
        where: { userId, name: { in: names } },
        select: { id: true, name: true, color: true },
      });
    },
  };
}

export type TagRepository = ReturnType<typeof createTagRepository>;
