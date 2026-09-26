import { createTaskService, GUEST_DEMO_TASKS } from "@/modules/tasks/services/task-service";
import { createHabitService, GUEST_DEMO_HABITS } from "@/modules/habits/services/habit-service";
import { getDayRangeInTimezone, getLocalHour } from "@/lib/date/timezone";
import { prisma } from "@/lib/db";
import type { TaskDTO } from "@/modules/tasks/types";
import type { HabitDTO } from "@/modules/habits/types";

export type DashboardData = {
  greeting: string;
  localDateText: string;
  todayCompletedCount: number;
  todayPendingCount: number;
  longestStreak: number;
  todayTasks: TaskDTO[];
  habits: HabitDTO[];
};

function greetingFor(hour: number): string {
  if (hour < 5) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function localDateTextFor(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
}

/** 访客演示数据（与模块演示数据保持同源，服务端短路返回，不查库） */
function guestDashboard(today: string, timezone: string): DashboardData {
  const hour = getLocalHour(new Date(), timezone);
  return {
    greeting: greetingFor(hour),
    localDateText: localDateTextFor(timezone, new Date()),
    todayCompletedCount: GUEST_DEMO_TASKS.filter((t) => t.completed).length,
    todayPendingCount: 2,
    longestStreak: Math.max(...GUEST_DEMO_HABITS.map((h) => h.longestStreak)),
    todayTasks: GUEST_DEMO_TASKS.filter((t) => !t.completed),
    habits: GUEST_DEMO_HABITS.map((h) => ({
      ...h,
      monthDates: h.monthDates.filter((d) => d <= today),
      checkedToday: h.monthDates.includes(today),
    })),
  };
}

/** 总览统计聚合：Promise.all 并发查询，避免串行等待拖慢首屏 */
export async function getDashboardData(params: {
  principal: { userId: string | null; isGuest: boolean };
  timezone: string;
  today: string;
}): Promise<DashboardData> {
  if (params.principal.isGuest || params.principal.userId === null) {
    return guestDashboard(params.today, params.timezone);
  }

  const userId = params.principal.userId;
  const now = new Date();
  const taskService = createTaskService();
  const habitService = createHabitService();

  const [taskList, habits, todayCompletedCount, longestStreak] = await Promise.all([
    taskService.listTasks({ principal: { userId, isGuest: false }, timezone: params.timezone, filter: "all", pageSize: 200 }),
    habitService.listHabits({ principal: { userId, isGuest: false }, today: params.today }),
    countTodayCompleted(userId, params.timezone),
    habitService.getMaxLongestStreak({ userId, today: params.today }),
  ]);

  const todayTasks = taskList.items.filter((t) => {
    if (t.completed) return false;
    if (!t.dueAt) return false;
    const dueDate = new Intl.DateTimeFormat("en-CA", { timeZone: params.timezone }).format(new Date(t.dueAt));
    return dueDate === params.today;
  });

  return {
    greeting: greetingFor(getLocalHour(now, params.timezone)),
    localDateText: localDateTextFor(params.timezone, now),
    todayCompletedCount,
    todayPendingCount: todayTasks.length,
    longestStreak,
    todayTasks,
    habits,
  };
}

async function countTodayCompleted(userId: string, timezone: string): Promise<number> {
  const range = getDayRangeInTimezone(new Date(), timezone);
  return prisma.task.count({
    where: { userId, deletedAt: null, completed: true, completedAt: { gte: range.start, lte: range.end } },
  });
}
