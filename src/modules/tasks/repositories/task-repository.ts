import type { Prisma, PrismaClient } from "@prisma/client";
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
          // 手动排序优先（拖拽结果持久化在 sortOrder），同序次按创建时间倒序
          orderBy: [{ completed: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
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

    create(userId: string, data: { title: string; description: string | null; dueAt: Date | null; priority: "LOW" | "MEDIUM" | "HIGH"; sortOrder?: number }) {
      return db.task.create({ data: { ...data, userId }, include: includeTags });
    },

    /** 当前用户最小 sortOrder（新任务插到未完成区顶部用） */
    async minSortOrder(userId: string): Promise<number> {
      const rows = await db.task.aggregate({
        where: { userId, deletedAt: null },
        _min: { sortOrder: true },
      });
      return rows._min.sortOrder ?? 0;
    },

    /** 拖拽排序持久化：按传入顺序重写 sortOrder（事务内逐条更新，均带 userId 作用域） */
    async reorder(userId: string, orderedIds: string[]) {
      await db.$transaction(
        orderedIds.map((id, index) =>
          db.task.updateMany({
            where: { id, userId, deletedAt: null },
            data: { sortOrder: index },
          }),
        ),
      );
    },

    /** 更新：以 userId 作用域写入（updateMany 兼作越权兜底；调用方随后 findById 取回完整实体） */
    update(userId: string, id: string, data: Partial<{ title: string; description: string | null; dueAt: Date | null; priority: "LOW" | "MEDIUM" | "HIGH"; completed: boolean; completedAt: Date | null }>) {
      return db.task.updateMany({ where: { id, userId, deletedAt: null }, data });
    },

    /** 软删除 */
    softDelete(userId: string, id: string) {
      return db.task.updateMany({ where: { id, userId }, data: { deletedAt: new Date() } });
    },

    /**
     * 替换任务标签（deleteMany + create）。
     * where 带 userId + deletedAt 作用域（extendedWhereUnique）：
     * 即使服务层归属校验与写入之间存在并发窗口，越权/已删除任务也会直接写入失败（P2025）。
     */
    setTags(userId: string, taskId: string, tagIds: string[]) {
      return db.task.update({
        where: { id: taskId, userId, deletedAt: null },
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
