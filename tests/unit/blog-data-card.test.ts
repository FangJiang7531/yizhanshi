import { describe, expect, it, vi } from "vitest";
import { createDataCardService, weekDaysOf } from "@/modules/blog/services/data-card.service";
import {
  buildHabitCardMarker,
  buildTaskCardMarker,
  decodeSnapshot,
  type HabitCardSnapshot,
  type TaskCardSnapshot,
} from "@/modules/blog/lib/data-cards";
import type { HabitService } from "@/modules/habits/services/habit-service";
import type { TaskService } from "@/modules/tasks/services/task-service";
import type { HabitDTO } from "@/modules/habits/types";
import { NotFoundError } from "@/lib/errors";

/**
 * 数据卡片服务（M7 编辑器链路的核心新成员）。
 *
 * 测试重点不是"正则能不能匹配"（那是 lib/data-cards 的职责），
 * 而是三条服务层语义：
 * 1. weekDaysOf 的周界运算（跨月/跨年回到正确的周一）；
 * 2. 快照口径——只有"本周窗口内"的打卡计入，窗口外一律忽略；
 * 3. injectSnapshots 的发布时刷新语义——有效标记覆盖刷新、
 *    失效标记原样保留（渲染端降级）、同标记去重不重复查库。
 *
 * 服务依赖经 deps 注入 mock，不触碰数据库。
 */

// ---------- 测试脚手架 ----------

function makeHabit(id: string, name: string, targetPerWeek: number): HabitDTO {
  return {
    id,
    name,
    description: null,
    color: "#ff7043",
    icon: "flame",
    targetPerWeek,
    currentStreak: 0,
    longestStreak: 0,
    completionRate: 0,
    monthDates: [],
    checkedToday: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeHabitService(habits: HabitDTO[], logsByHabit: Record<string, string[]>) {
  const rangeQueries: Array<{ habitId: string; start: string; end: string }> = [];
  const svc = {
    listHabits: vi.fn().mockResolvedValue(habits),
    getLogDatesInRange: vi.fn(async (p: { habitId: string; start: string; end: string }) => {
      rangeQueries.push({ habitId: p.habitId, start: p.start, end: p.end });
      const all = logsByHabit[p.habitId] ?? [];
      return all.filter((d) => d >= p.start && d <= p.end).sort();
    }),
  } as unknown as HabitService;
  return { svc, rangeQueries };
}

function makeTaskService(total: number, completed: number) {
  const listCalls: Array<{ filter: string; [k: string]: unknown }> = [];
  const svc = {
    listTasks: vi.fn(async (p: { filter: string; [k: string]: unknown }) => {
      listCalls.push(p);
      return { items: [], total: p.filter === "completed" ? completed : total };
    }),
  } as unknown as TaskService;
  return { svc, listCalls };
}

// 锚点：2026-01-01 是周四，所在周为 2025-12-29（周一）→ 2026-01-04（周日）
const TODAY = "2026-01-01";
const WEEK = ["2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"];
const TZ = "Asia/Shanghai";

/** 打卡在窗口内 2 天（周一 12-29、周四 01-01），窗口外 1 天（01-10 不应计入） */
const LOGS = { h1: ["2025-12-29", "2026-01-01", "2026-01-10"] };

// ---------- weekDaysOf：周界运算 ----------

describe("weekDaysOf（周界：永远回到用户时区的周一起算）", () => {
  it("周一当天即本周首日", () => {
    // 2026-09-28 是周一
    expect(weekDaysOf("2026-09-28")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("周四起算跨年：2026-01-01 → 2025-12-29..2026-01-04", () => {
    expect(weekDaysOf(TODAY)).toEqual(WEEK);
  });

  it("周日收尾跨月：2026-03-01（周日）→ 2026-02-23..2026-03-01（非闰年二月）", () => {
    expect(weekDaysOf("2026-03-01")).toEqual([
      "2026-02-23",
      "2026-02-24",
      "2026-02-25",
      "2026-02-26",
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
    ]);
  });

  it("周六跨月：2026-08-01 → 2026-07-27..2026-08-02", () => {
    expect(weekDaysOf("2026-08-01")[0]).toBe("2026-07-27");
    expect(weekDaysOf("2026-08-01")[6]).toBe("2026-08-02");
  });

  it("恒为 7 天且严格递增", () => {
    for (const d of ["2026-01-01", "2026-03-01", "2026-08-01", "2026-09-30"]) {
      const week = weekDaysOf(d);
      expect(week).toHaveLength(7);
      for (let i = 1; i < week.length; i++) expect(week[i]! > week[i - 1]!).toBe(true);
    }
  });
});

// ---------- buildCard / listHabitSources ----------

describe("buildCard（编辑器插入时的即时快照）", () => {
  it("习惯卡：快照只统计本周窗口内的打卡（窗口外不计入）", async () => {
    const { svc, rangeQueries } = makeHabitService([makeHabit("h1", "晨间阅读", 5)], LOGS);
    const service = createDataCardService({ habits: svc });

    const { marker } = await service.buildCard("u1", { kind: "habit", habitId: "h1" }, TODAY, TZ);

    expect(marker).toContain('habitId="h1"');
    const snap = decodeSnapshot<HabitCardSnapshot>(/snapshot="([^"]*)"/.exec(marker)![1]!);
    expect(snap).toMatchObject({ name: "晨间阅读", range: "week", done: 2, target: 5 });
    // 位图：周一/周四为 true，其余 false
    expect(snap?.days).toEqual([true, false, false, true, false, false, false]);
    // 区间查询落在周界上
    expect(rangeQueries).toEqual([{ habitId: "h1", start: "2025-12-29", end: "2026-01-04" }]);
  });

  it("习惯不存在（已删除/他人）→ NotFoundError，由 UI 提示而非静默插入空卡", async () => {
    const { svc } = makeHabitService([], {});
    const service = createDataCardService({ habits: svc });
    await expect(service.buildCard("u1", { kind: "habit", habitId: "ghost" }, TODAY, TZ)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("任务卡：两条 total 查询拼出整体进度快照", async () => {
    const { svc, listCalls } = makeTaskService(12, 5);
    const service = createDataCardService({ tasks: svc });

    const { marker } = await service.buildCard("u1", { kind: "task" }, TODAY, TZ);

    expect(marker).toContain('taskId="all"');
    const snap = decodeSnapshot<TaskCardSnapshot>(/snapshot="([^"]*)"/.exec(marker)![1]!);
    expect(snap).toEqual({ title: "任务进度", total: 12, completed: 5 });
    expect(listCalls.map((c) => c.filter)).toEqual(["all", "completed"]);
  });
});

describe("listHabitSources（插入面板来源列表）", () => {
  it("副标题带本周完成数，逐习惯查询周区间", async () => {
    const { svc } = makeHabitService([makeHabit("h1", "晨间阅读", 5), makeHabit("h2", "夜跑", 3)], LOGS);
    const service = createDataCardService({ habits: svc });

    const sources = await service.listHabitSources("u1", TODAY);

    expect(sources).toEqual([
      { id: "h1", name: "晨间阅读", color: "#ff7043", subtitle: "本周 2/5 天" },
      { id: "h2", name: "夜跑", color: "#ff7043", subtitle: "本周 0/3 天" },
    ]);
  });
});

// ---------- injectSnapshots：发布时的快照刷新 ----------

describe("injectSnapshots（发布时快照固化）", () => {
  const stale: HabitCardSnapshot = {
    name: "晨间阅读",
    range: "week",
    done: 0,
    target: 5,
    days: [false, false, false, false, false, false, false],
  };

  it("正文无任何指令标记 → 原文返回且零查询", async () => {
    const habitMock = makeHabitService([makeHabit("h1", "晨间阅读", 5)], LOGS);
    const taskMock = makeTaskService(9, 9);
    const service = createDataCardService({ habits: habitMock.svc, tasks: taskMock.svc });

    const md = "# 标题\n\n普通段落，含 ::: 提示容器但不是卡片标记\n\n:::note\n提示\n:::\n";
    expect(await service.injectSnapshots(md, "u1", TODAY, TZ)).toBe(md);
    expect(habitMock.svc.listHabits).not.toHaveBeenCalled();
    expect(taskMock.svc.listTasks).not.toHaveBeenCalled();
  });

  it("有效习惯标记 → 旧快照被刷新为发布时刻的数据", async () => {
    const { svc } = makeHabitService([makeHabit("h1", "晨间阅读", 5)], LOGS);
    const service = createDataCardService({ habits: svc });

    const oldMarker = buildHabitCardMarker("h1", stale);
    const md = `开头段落\n\n${oldMarker}\n\n结尾段落`;
    const out = await service.injectSnapshots(md, "u1", TODAY, TZ);

    expect(out).not.toContain(oldMarker);
    expect(out).toContain("开头段落");
    expect(out).toContain("结尾段落");
    const fresh = decodeSnapshot<HabitCardSnapshot>(/snapshot="([^"]*)"/.exec(out)![1]!);
    expect(fresh).toMatchObject({ done: 2, target: 5 });
    expect(fresh?.days).toEqual([true, false, false, true, false, false, false]);
  });

  it("习惯已删除 → 标记原样保留（渲染端降级为“数据不可用”，不让发布失败）", async () => {
    const { svc } = makeHabitService([], LOGS);
    const service = createDataCardService({ habits: svc });

    const md = `段落\n\n${buildHabitCardMarker("gone", stale)}`;
    expect(await service.injectSnapshots(md, "u1", TODAY, TZ)).toBe(md);
  });

  it("缺 habitId 的畸形标记 → 原样保留，不影响其余有效标记刷新", async () => {
    const { svc } = makeHabitService([makeHabit("h1", "晨间阅读", 5)], LOGS);
    const service = createDataCardService({ habits: svc });

    const valid = buildHabitCardMarker("h1", stale);
    const md = `:::habit-summary{}\n\n${valid}\n\n:::habit-summary{range="week"}`;
    const out = await service.injectSnapshots(md, "u1", TODAY, TZ);

    expect(out).toContain(":::habit-summary{}");
    expect(out).toContain(':::habit-summary{range="week"');
    expect(out).not.toContain(valid);
    expect(decodeSnapshot<HabitCardSnapshot>(/snapshot="([^"]*)"/.exec(out)![1]!)).toMatchObject({ done: 2 });
  });

  it("任务标记（含重复）→ 快照只生成一次，全部替换", async () => {
    const { svc, listCalls } = makeTaskService(12, 5);
    const service = createDataCardService({ tasks: svc });

    const oldMarker = buildTaskCardMarker("all", { title: "任务进度", total: 3, completed: 3 });
    const md = `前文\n\n${oldMarker}\n\n中段\n\n${oldMarker}`;
    const out = await service.injectSnapshots(md, "u1", TODAY, TZ);

    // 两次 listTasks（all + completed）= 一次快照生成；重复标记共享同一份
    expect(listCalls).toHaveLength(2);
    expect(out).not.toContain(oldMarker);
    const matches = [...out.matchAll(/snapshot="([^"]*)"/g)];
    expect(matches).toHaveLength(2);
    for (const m of matches) {
      expect(decodeSnapshot<TaskCardSnapshot>(m[1]!)).toEqual({ title: "任务进度", total: 12, completed: 5 });
    }
  });

  it("习惯与任务标记混合 → 各自刷新，互不干扰", async () => {
    const habitMock = makeHabitService([makeHabit("h1", "晨间阅读", 5)], LOGS);
    const taskMock = makeTaskService(8, 4);
    const service = createDataCardService({ habits: habitMock.svc, tasks: taskMock.svc });

    const habitMarker = buildHabitCardMarker("h1", stale);
    const taskMarker = buildTaskCardMarker("all", { title: "任务进度", total: 1, completed: 0 });
    const md = `## 周报\n\n${habitMarker}\n\n${taskMarker}`;
    const out = await service.injectSnapshots(md, "u1", TODAY, TZ);

    expect(out).not.toContain(habitMarker);
    expect(out).not.toContain(taskMarker);
    expect(out).toContain('habitId="h1"');
    expect(out).toContain('taskId="all"');
  });
});
