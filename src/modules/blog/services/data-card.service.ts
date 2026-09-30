import { createHabitService } from "@/modules/habits/services/habit-service";
import { createTaskService } from "@/modules/tasks/services/task-service";
import { NotFoundError } from "@/lib/errors";
import { nextDay, previousDay, weekdayOf } from "@/lib/date/timezone";
import {
  buildHabitCardMarker,
  buildTaskCardMarker,
  parseCardAttrs,
  type HabitCardSnapshot,
  type TaskCardSnapshot,
} from "../lib/data-cards";

/**
 * 数据卡片生成服务（策划文档 §8.5 / PRD A-20）。
 *
 * 职责边界（跨模块硬约束，eslint no-restricted-imports 兜底）：
 * 习惯/任务数据**只能**通过对方模块的 service 层获取，禁止直接触碰其仓储或表。
 *
 * 快照时机的两条路径：
 * 1. **编辑器插入时**：`buildCard` 立即生成一份快照（插入即预览有数据）；
 * 2. **发布/重新发布时**：`injectSnapshots` 扫描全文，把每个卡片标记的快照
 *    刷新为"此刻"的数据 —— 这是快照固化的关键环节（否则"本周打卡 7 天"
 *    下周会变成"0 天"）。
 */

export type HabitCardSource = {
  id: string;
  name: string;
  color: string;
  /** 展示副标题，如 "本周 3/5 天" */
  subtitle: string;
};

export type DataCardServiceDeps = {
  habits?: ReturnType<typeof createHabitService>;
  tasks?: ReturnType<typeof createTaskService>;
};

/** 卡片标记的两条正则（snapshot 为 base64url，不含 `}`，可安全用 [^}]* 匹配） */
const HABIT_MARKER_RE = /:::habit-summary\{[^}]*\}/g;
const TASK_MARKER_RE = /:::task-progress\{[^}]*\}/g;

/**
 * 本周的 7 个日期串（周一 → 周日，用户时区"今天"所在周）。
 * weekdayOf 返回 0=周日 … 6=周六。
 */
export function weekDaysOf(today: string): string[] {
  const wd = weekdayOf(today);
  const offset = wd === 0 ? 6 : wd - 1;
  const days: string[] = [];
  let cursor = today;
  for (let i = 0; i < offset; i++) cursor = previousDay(cursor);
  for (let i = 0; i < 7; i++) {
    days.push(cursor);
    cursor = nextDay(cursor);
  }
  return days;
}

export function createDataCardService(deps: DataCardServiceDeps = {}) {
  const habitSvc = deps.habits ?? createHabitService();
  const taskSvc = deps.tasks ?? createTaskService();

  /** 构造习惯卡快照；习惯不存在（已删除/他人）返回 null，由调用方决定降级方式 */
  async function buildHabitSnapshot(userId: string, habitId: string, today: string): Promise<HabitCardSnapshot | null> {
    const habits = await habitSvc.listHabits({ principal: { userId, isGuest: false }, today });
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return null;

    const weekDays = weekDaysOf(today);
    const first = weekDays[0];
    const last = weekDays[6];
    if (first === undefined || last === undefined) return null;

    const logged = await habitSvc.getLogDatesInRange({ userId, habitId, start: first, end: last });
    const loggedSet = new Set(logged);
    return {
      name: habit.name,
      range: "week",
      done: weekDays.filter((d) => loggedSet.has(d)).length,
      target: habit.targetPerWeek,
      days: weekDays.map((d) => loggedSet.has(d)),
    };
  }

  /**
   * 任务进度卡快照（整体口径：全部任务的总数 / 已完成数）。
   *
   * 目前只有"整体"一种粒度：taskId="all" 是集合标识（语法要求该属性存在）。
   * 未来若要支持"按标签/清单"的粒度，此字段承载具体分组 id，快照结构不变。
   *
   * 计数走两条独立查询的 total（仓储返回的 total 恒为全量 count，与分页无关），
   * 避免"先取全部再在内存里数"在大数据量下失真。
   */
  async function buildTaskSnapshot(userId: string, timezone: string): Promise<TaskCardSnapshot> {
    const base = { principal: { userId, isGuest: false }, timezone, pageSize: 1 } as const;
    const [all, completed] = await Promise.all([
      taskSvc.listTasks({ ...base, filter: "all" }),
      taskSvc.listTasks({ ...base, filter: "completed" }),
    ]);
    return { title: "任务进度", total: all.total, completed: completed.total };
  }

  return {
    /** 可选的习惯源列表（插入面板用；轻量字段，不携带 streak 全量统计） */
    async listHabitSources(userId: string, today: string): Promise<HabitCardSource[]> {
      const habits = await habitSvc.listHabits({ principal: { userId, isGuest: false }, today });
      const weekDays = weekDaysOf(today);
      const first = weekDays[0];
      const last = weekDays[6];
      const sources: HabitCardSource[] = [];
      for (const habit of habits) {
        let done = 0;
        if (first && last) {
          const logged = await habitSvc.getLogDatesInRange({ userId, habitId: habit.id, start: first, end: last });
          done = new Set(logged).size;
        }
        sources.push({
          id: habit.id,
          name: habit.name,
          color: habit.color,
          subtitle: `本周 ${done}/${habit.targetPerWeek} 天`,
        });
      }
      return sources;
    },

    /** 生成插入用的卡片标记（含当前快照） */
    async buildCard(
      userId: string,
      params: { kind: "habit"; habitId: string } | { kind: "task" },
      today: string,
      timezone: string,
    ): Promise<{ marker: string }> {
      if (params.kind === "habit") {
        const snapshot = await buildHabitSnapshot(userId, params.habitId, today);
        if (!snapshot) {
          throw new NotFoundError("习惯不存在或已删除");
        }
        return { marker: buildHabitCardMarker(params.habitId, snapshot) };
      }
      const snapshot = await buildTaskSnapshot(userId, timezone);
      return { marker: buildTaskCardMarker("all", snapshot) };
    },

    /**
     * 发布前刷新正文中所有卡片标记的快照（PRD §5.3 步骤⑤ 的一部分）。
     *
     * - 数据源不存在 → 保留原标记原样（渲染端会降级为"该数据已不可用"文案，不报错）
     * - 标记内已有快照 → **用最新数据覆盖**（"发布时的数据"是快照的语义）；
     *   仅在编辑器中未发布过的标记才谈得上"首次固化"
     * - 相同标记出现多次 → 快照只生成一次（Map 去重），避免重复查库
     */
    async injectSnapshots(contentMd: string, userId: string, today: string, timezone: string): Promise<string> {
      if (!contentMd.includes(":::")) return contentMd;

      const replacements = new Map<string, string>();

      for (const match of contentMd.matchAll(HABIT_MARKER_RE)) {
        const whole = match[0];
        if (replacements.has(whole)) continue;
        const habitId = parseCardAttrs(whole).habitId;
        if (!habitId) continue;
        const snapshot = await buildHabitSnapshot(userId, habitId, today);
        if (snapshot) replacements.set(whole, buildHabitCardMarker(habitId, snapshot));
      }

      // 任务卡在本文档内快照一致：先判断是否存在，再生成一次
      const hasTaskMarkers = TASK_MARKER_RE.test(contentMd);
      TASK_MARKER_RE.lastIndex = 0;
      if (hasTaskMarkers) {
        const snapshot = await buildTaskSnapshot(userId, timezone);
        for (const match of contentMd.matchAll(TASK_MARKER_RE)) {
          const whole = match[0];
          if (replacements.has(whole)) continue;
          const taskId = parseCardAttrs(whole).taskId;
          if (!taskId) continue;
          replacements.set(whole, buildTaskCardMarker(taskId, snapshot));
        }
      }

      if (replacements.size === 0) return contentMd;
      let result = contentMd;
      for (const kindRe of [HABIT_MARKER_RE, TASK_MARKER_RE]) {
        result = result.replace(kindRe, (whole) => replacements.get(whole) ?? whole);
      }
      return result;
    },
  };
}
