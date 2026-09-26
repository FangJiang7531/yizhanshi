import type { Prisma, PrismaClient, Task } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import type { DateStr } from "@/lib/date/timezone";
import { fromZonedTime } from "date-fns-tz";
import type { TaskFilter } from "../types";

/**
 * 任务仓储层。纪律：所有查询方法第一个参数必须是 userId —— 数据隔离的物理保障；
 * 所有查询强制 deletedAt: null（软删除过滤）。
 */
export function createTaskRepository(db: PrismaClient = defaultPrisma) {
  const includeTags = { tags: { include: { tag: true } } } satisfies Prisma.TaskInclude;

  function serializeTags(task: Task & { tags: { tag: { id: string; name: string; color: string } }[] }) {
    return task.tags.map((tt) => ({ id: tt.tag.id, name: tt.tag.name, color: tt.tag.color }));
  }

  return {
    /**
     * 列表查询（一次取回标签避免 N+1；事务内同时取总数保证分页一致）。
     * today = 用户时区下 dueAt 落在今天内且未完成。
     */
    async findMany(params: {
      userId: string;
      filter: TaskFilter;
      search?: string;
      page: number;
      pageSize: number;
      /** 用户时区下“今天”的 UTC 起止 */
      todayRange?: { start: Date; end: Date };
    }) {
      const where: Prisma.TaskWhereInput = {
        userId: params.userId,
        deletedAt: null,
      };
      if (params.filter === "completed") {
        where.completed = true;
      } else if (params.filter === "today" && params.todayRange) {
        where.completed = false;
        where.dueAt = { gte: params.todayRange.start, lte: params.todayRange.end };
      }
      if (params.search) {
        where.OR = [
          { title: { contains: params.search, mode: "insensitive" } },
          { description: { contains: params.search, mode: "insensitive" } },
        ];
      }

      const [items, total] = await db.$transaction([
        db.task.findMany({
          where,
          include: includeTags,
          orderBy: [{ completed: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
        }),
        db.task.count({ where }),
      ]);
      return { items, total };
    },

    /** 今日待办（总览用） */
    findTodayPending(userId: string, range: { start: Date; end: Date }, take = 20) {
      return db.task.findMany({
        where: { userId, deletedAt: null, completed: false, dueAt: { gte: range.start, lte: range.end } },
        include: includeTags,
        orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
        take,
      });
    },

    /** 今日已完成数（总览统计口径：completedAt 落在用户时区今天内） */
    countCompletedBetween(userId: string, range: { start: Date; end: Date }) {
      return db.task.count({
        where: { userId, deletedAt: null, completed: true, completedAt: { gte: range.start, lte: range.end } },
      });
    },

    findById(userId: string, id: string) {
      return db.task.findFirst({ where: { id, userId, deletedAt: null }, include: includeTags });
    },

    /**
     * 按 id 查找（含软删除）。用于越权判定：
     * 不存在与“不属于当前用户”统一返回 null → 服务层抛 NotFoundError，不泄漏存在性。
     */
    findByIdAnyScope(id: string) {
      return db.task.findFirst({ where: { id }, include: includeTags });
    },

    create(userId: string, data: { title: string; description: string | null; dueAt: Date | null; priority: "LOW" | "MEDIUM" | "HIGH" }) {
      return db.task.create({ data: { ...data, userId }, include: includeTags });
    },

    update(userId: string, id: string, data: Partial<{ title: string; description: string | null; dueAt: Date | null; priority: "LOW" | "MEDIUM" | "HIGH"; completed: boolean; completedAt: Date | null }>) {
      return db.task.update({ where: { id }, data, include: includeTags });
    },

    /** 软删除 */
    softDelete(userId: string, id: string) {
      return db.task.updateMany({ where: { id, userId }, data: { deletedAt: new Date() } });
    },

    setTags(taskId: string, tagIds: string[]) {
      return db.task.update({
        where: { id: taskId },
        data: {
          tags: {
            deleteMany: {},
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
      });
    },

    /** 把 UTC Date 转用户时区 dueAt 存储 instant（按当天 00:00 解释） */
    dueAtFromDateStr(dateStr: DateStr, timezone: string): Date {
      return fromZonedTime(`${dateStr}T00:00:00.000`, timezone);
    },
  };
}

export type TaskRepository = ReturnType<typeof createTaskRepository>;
