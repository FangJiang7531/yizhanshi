import { createHabitRepository, type HabitRepository } from "../repositories/habit-repository";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { calcCurrentStreak, calcLongestStreak, calcMonthlyCompletionRate } from "@/lib/date/streak";
import { monthEndOf, monthStartOf } from "@/lib/date/timezone";
import type { CreateHabitInput, HabitIcon, UpdateHabitInput } from "../schemas";
import type { HabitDTO, ToggleLogResult } from "../types";

/** 访客模式演示数据 */
export const GUEST_DEMO_HABITS: HabitDTO[] = [
  {
    id: "demo-habit-1",
    name: "阅读 30 分钟（演示）",
    description: "注册后创建属于你的习惯",
    color: "#4A7C59",
    icon: "book-open",
    targetPerWeek: 7,
    currentStreak: 3,
    longestStreak: 5,
    completionRate: 66.7,
    monthDates: ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-25", "2026-09-26"],
    checkedToday: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
  },
  {
    id: "demo-habit-2",
    name: "喝够 8 杯水（演示）",
    description: null,
    color: "#5B7A9D",
    icon: "droplets",
    targetPerWeek: 7,
    currentStreak: 0,
    longestStreak: 2,
    completionRate: 33.3,
    monthDates: ["2026-09-22", "2026-09-24"],
    checkedToday: false,
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
  },
];

/**
 * 习惯服务层。streak 三口径全部复用纯函数（PRD §4.4 / 附录 B），
 * 参照日由调用方传入，服务层不用 new Date() 推断“今天”。
 */
export function createHabitService(habitRepo: HabitRepository = createHabitRepository()) {
  return {
    async listHabits(params: {
      principal: { userId: string | null; isGuest: boolean };
      /** 参照日（用户时区“今天”，客户端/控制器算好传入） */
      today: string;
    }): Promise<HabitDTO[]> {
      if (params.principal.isGuest || params.principal.userId === null) {
        return GUEST_DEMO_HABITS.map((h) => ({
          ...h,
          monthDates: h.monthDates.filter((d) => d >= monthStartOf(params.today) && d <= monthEndOf(params.today)),
          checkedToday: h.monthDates.includes(params.today),
        }));
      }

      const userId = params.principal.userId;
      const habits = await habitRepo.listActive(userId);
      if (habits.length === 0) return [];

      const monthStart = monthStartOf(params.today);
      const monthEnd = monthEndOf(params.today);

      // 一次取当月打卡（热力图），再按习惯聚合
      const monthLogs = await habitRepo.findLogsInMonth(userId, monthStart, monthEnd);
      const byHabit = new Map<string, Set<string>>();
      for (const log of monthLogs) {
        const set = byHabit.get(log.habitId) ?? new Set<string>();
        set.add(utcDateStr(log.logDate));
        byHabit.set(log.habitId, set);
      }

      // 连续天数与完成率需要全量日期：按习惯逐个取（个人规模习惯数有限，可接受；
      // 日期数据按年分段优化留给数据量增长的后续阶段）
      const result: HabitDTO[] = [];
      for (const habit of habits) {
        const allDates = await habitRepo.findAllLogDates(userId, habit.id);
        const dateSet = new Set(allDates);
        const monthSet = byHabit.get(habit.id) ?? new Set<string>();
        result.push({
          id: habit.id,
          name: habit.name,
          description: habit.description,
          color: habit.color,
          icon: habit.icon as HabitIcon,
          targetPerWeek: habit.targetPerWeek,
          currentStreak: calcCurrentStreak(dateSet, params.today),
          longestStreak: calcLongestStreak(allDates),
          completionRate: round1(calcMonthlyCompletionRate(dateSet, params.today) * 100),
          monthDates: [...monthSet],
          checkedToday: dateSet.has(params.today),
          createdAt: habit.createdAt.toISOString(),
          updatedAt: habit.updatedAt.toISOString(),
        });
      }
      return result;
    },

    async createHabit(params: { userId: string }, data: CreateHabitInput): Promise<HabitDTO> {
      const habit = await habitRepo.create(params.userId, {
        name: data.name,
        description: data.description ? data.description : null,
        color: data.color,
        icon: data.icon,
        targetPerWeek: data.targetPerWeek,
      });
      return {
        id: habit.id,
        name: habit.name,
        description: habit.description,
        color: habit.color,
        icon: habit.icon as HabitIcon,
        targetPerWeek: habit.targetPerWeek,
        currentStreak: 0,
        longestStreak: 0,
        completionRate: 0,
        monthDates: [],
        checkedToday: false,
        createdAt: habit.createdAt.toISOString(),
        updatedAt: habit.updatedAt.toISOString(),
      };
    },

    async updateHabit(params: { userId: string }, data: UpdateHabitInput): Promise<{ updated: true }> {
      const existing = await habitRepo.findById(params.userId, data.id);
      if (!existing) throw new NotFoundError("习惯不存在");
      await habitRepo.update(params.userId, data.id, {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description ? data.description : null } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        ...(data.targetPerWeek !== undefined ? { targetPerWeek: data.targetPerWeek } : {}),
      });
      return { updated: true };
    },

    async archiveHabit(params: { userId: string }, id: string, archived: boolean): Promise<{ archived: true }> {
      const existing = await habitRepo.findById(params.userId, id);
      if (!existing) throw new NotFoundError("习惯不存在");
      await habitRepo.archive(params.userId, id, archived);
      return { archived: true };
    },

    /** 已归档习惯（轻量：不计算 streak 统计，供归档管理区展示与恢复） */
    async listArchivedHabits(params: { userId: string }): Promise<HabitDTO[]> {
      const habits = await habitRepo.listArchived(params.userId);
      return habits.map((habit) => ({
        id: habit.id,
        name: habit.name,
        description: habit.description,
        color: habit.color,
        icon: habit.icon as HabitIcon,
        targetPerWeek: habit.targetPerWeek,
        currentStreak: 0,
        longestStreak: 0,
        completionRate: 0,
        monthDates: [],
        checkedToday: false,
        createdAt: habit.createdAt.toISOString(),
        updatedAt: habit.updatedAt.toISOString(),
      }));
    },

    /**
     * 指定日期区间（含边界）内的打卡日期串，升序。
     *
     * 供跨模块只读场景（博客数据卡片快照）使用 —— 卡片"本周打卡位图"可能跨越
     * 月初/月末，而 listHabits 的 monthDates 只有当月，用它会丢跨月的天数。
     * 日期串为 YYYY-MM-DD，字符串比较即日期比较（与全库口径一致）。
     * 个人规模数据全量取回再过滤即可，无需为区间查询引入额外索引。
     */
    async getLogDatesInRange(params: { userId: string; habitId: string; start: string; end: string }): Promise<string[]> {
      const all = await habitRepo.findAllLogDates(params.userId, params.habitId);
      return all.filter((d) => d >= params.start && d <= params.end).sort();
    },

    async deleteHabit(params: { userId: string }, id: string): Promise<{ deleted: true }> {
      const existing = await habitRepo.findById(params.userId, id);
      if (!existing) throw new NotFoundError("习惯不存在");
      await habitRepo.softDelete(params.userId, id);
      return { deleted: true };
    },

    /**
     * 打卡 / 取消打卡（幂等）。返回切换后的最新统计，供前端即时更新。
     * logDate 由客户端在用户时区算好传上来，服务端按字符串存取。
     */
    async toggleLog(
      params: { userId: string; today: string },
      habitId: string,
      logDateStr: string,
    ): Promise<ToggleLogResult> {
      const habit = await habitRepo.findById(params.userId, habitId);
      if (!habit) throw new NotFoundError("习惯不存在");

      const existing = await habitRepo.findLog(habitId, logDateStr);
      if (existing) {
        await habitRepo.deleteLog(habitId, logDateStr);
      } else {
        await habitRepo.upsertLog(habitId, params.userId, logDateStr);
      }

      const allDates = await habitRepo.findAllLogDates(params.userId, habitId);
      const dateSet = new Set(allDates);
      const todaySet = dateSet;
      return {
        habitId,
        checked: !existing,
        currentStreak: calcCurrentStreak(todaySet, params.today),
        longestStreak: calcLongestStreak(allDates),
        completionRate: round1(calcMonthlyCompletionRate(dateSet, params.today) * 100),
      };
    },

    /** 全部习惯中最长连续天数（总览统计口径：取最长，不是当前连续） */
    async getMaxLongestStreak(params: { userId: string; today: string }): Promise<number> {
      const habits = await habitRepo.listActive(params.userId);
      let max = 0;
      for (const habit of habits) {
        const allDates = await habitRepo.findAllLogDates(params.userId, habit.id);
        max = Math.max(max, calcLongestStreak(allDates));
      }
      return max;
    },

    validateLogDate(logDate: string, today: string) {
      // 允许补打过去日期（漏打卡补记），拒绝未来日期
      if (logDate > today) {
        throw new ValidationError({ logDate: ["不能为未来的日期打卡"] }, "不能为未来的日期打卡");
      }
    },
  };
}

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export type HabitService = ReturnType<typeof createHabitService>;
