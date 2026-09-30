import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

/**
 * 任务标签仓储层（纪律：首参 userId）。
 *
 * 阶段二起 Tag 表引入 scope 字段与博客标签共用一张表。
 * 本模块所有查询**硬编码 scope: "TASK"**——不提供无 scope 参数的方法，
 * 从接口层面消除"任务标签页混入博客标签"的遗漏可能（PRD §4.2 约束一 / B-09）。
 * 删除语义：只解除关联，不删除任务。
 */
export function createTagRepository(db: PrismaClient = defaultPrisma) {
  const SCOPE = "TASK" as const;

  return {
    listByUser(userId: string) {
      return db.tag.findMany({
        where: { userId, scope: SCOPE },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, color: true },
      });
    },

    /** 校验 tagIds 全部属于该用户且为任务域（防跨用户挂标签 / 跨域挂标签） */
    async countOwned(userId: string, tagIds: string[]) {
      return db.tag.count({ where: { id: { in: tagIds }, userId, scope: SCOPE } });
    },

    create(userId: string, data: { name: string; color: string }) {
      return db.tag.create({
        data: { ...data, userId, scope: SCOPE },
        select: { id: true, name: true, color: true },
      });
    },

    /** 删除标签：TaskTag 关联级联删除，任务本身保留 */
    delete(userId: string, tagId: string) {
      return db.tag.deleteMany({ where: { id: tagId, userId, scope: SCOPE } });
    },

    findByNames(userId: string, names: string[]) {
      return db.tag.findMany({
        where: { userId, scope: SCOPE, name: { in: names } },
        select: { id: true, name: true, color: true },
      });
    },
  };
}

export type TagRepository = ReturnType<typeof createTagRepository>;
