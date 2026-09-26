import type { PrismaClient, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { parseDateStrToUtcDate, utcDateToDateStr } from "@/lib/date/timezone";

/**
 * 习惯仓储层（纪律：首参 userId）。
 * logDate 是 @db.Date：写入用 parseDateStrToUtcDate（UTC 午夜），读取用 UTC 分量还原日期串。
 */
export function createHabitRepository(db: PrismaClient = defaultPrisma) {
  return {
    listActive(userId: string) {
      return db.habit.findMany({
        where: { userId, deletedAt: null, archivedAt: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
    },

    findById(userId: string, habitId: string) {
      return db.habit.findFirst({ where: { id: habitId, userId, deletedAt: null } });
    },

    create(userId: string, data: { name: string; description: string | null; color: string; icon: string; targetPerWeek: number }) {
      return db.habit.create({ data: { ...data, userId } });
    },

    update(userId: string, habitId: string, data: Partial<{ name: string; description: string | null; color: string; icon: string; targetPerWeek: number }>) {
      return db.habit.updateMany({ where: { id: habitId, userId, deletedAt: null }, data });
    },

    /** 归档：从列表隐藏但保留全部历史数据（可恢复） */
    archive(userId: string, habitId: string, archived: boolean) {
      return db.habit.updateMany({
        where: { id: habitId, userId, deletedAt: null },
        data: { archivedAt: archived ? new Date() : null },
      });
    },

    /** 软删除习惯（历史记录保留在库中但不再展示） */
    softDelete(userId: string, habitId: string) {
      return db.habit.updateMany({ where: { id: habitId, userId }, data: { deletedAt: new Date() } });
    },

    /** 幂等打卡：存在则忽略，不存在则创建（@@unique([habitId, logDate]) 兜底） */
    async upsertLog(habitId: string, userId: string, logDateStr: string) {
      const logDate = parseDateStrToUtcDate(logDateStr);
      return db.habitLog.upsert({
        where: { habitId_logDate: { habitId, logDate } },
        create: { habitId, userId, logDate },
        update: {},
      });
    },

    /** 取消打卡 */
    deleteLog(habitId: string, logDateStr: string) {
      return db.habitLog.deleteMany({
        where: { habitId, logDate: parseDateStrToUtcDate(logDateStr) },
      });
    },

    findLog(habitId: string, logDateStr: string) {
      return db.habitLog.findUnique({
        where: { habitId_logDate: { habitId, logDate: parseDateStrToUtcDate(logDateStr) } },
      });
    },

    /** 某习惯全部打卡日期串（升序） */
    async findAllLogDates(userId: string, habitId: string): Promise<string[]> {
      const logs = await db.habitLog.findMany({
        where: { userId, habitId },
        select: { logDate: true },
        orderBy: { logDate: "asc" },
      });
      return logs.map((l) => utcDateToDateStr(l.logDate));
    },

    /** 一次查询取该用户某月全部打卡（供热力图，避免 N+1） */
    findLogsInMonth(userId: string, monthStartDateStr: string, monthEndDateStr: string) {
      return db.habitLog.findMany({
        where: {
          userId,
          logDate: { gte: parseDateStrToUtcDate(monthStartDateStr), lte: parseDateStrToUtcDate(monthEndDateStr) },
        },
        select: { habitId: true, logDate: true },
      });
    },

    /** 某习惯今日是否已打卡（today 传用户时区日期串） */
    findLogOnDate(habitId: string, todayStr: string) {
      return db.habitLog.findUnique({
        where: { habitId_logDate: { habitId, logDate: parseDateStrToUtcDate(todayStr) } },
      });
    },

    /** 按用户聚合某天的打卡习惯 id（总览用） */
    findLoggedHabitIdsOnDate(userId: string, dateStr: string) {
      return db.habitLog.findMany({
        where: { userId, logDate: parseDateStrToUtcDate(dateStr) },
        select: { habitId: true },
      });
    },

    /** 统计某个 where 下打卡总数（管理/统计用） */
    count(where: Prisma.HabitLogWhereInput) {
      return db.habitLog.count({ where });
    },
  };
}

export type HabitRepository = ReturnType<typeof createHabitRepository>;
