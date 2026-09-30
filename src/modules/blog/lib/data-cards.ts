/**
 * 跨模块数据卡片（PRD A-20 / 策划文档 §8.5）
 *
 * 语法（写入 Markdown 正文）：
 *   :::habit-summary{habitId="xxx" range="week" snapshot="<base64url JSON>"}
 *   :::task-progress{taskId="xxx" snapshot="<base64url JSON>"}
 *
 * 快照机制（关键设计）：发布时把当时的统计数据序列化进 snapshot，
 * 渲染时优先用快照 → 历史文章中的数字不会随时间变化
 * （否则"本周打卡 7 天"下周会变成"0 天"）。
 *
 * 快照生成必须通过对方模块的 service 层（禁止直接查表，ESLint 硬约束），
 * 生成入口见 services/data-card.service.ts。
 *
 * 降级：无快照 / 解析失败 → 渲染为静态文本"（该数据已不可用）"，不报错、不空白。
 */

export type HabitCardSnapshot = {
  /** 习惯名 */
  name: string;
  /** 区间标识：week | month */
  range: string;
  /** 区间内已完成天数 */
  done: number;
  /** 区间目标天数 */
  target: number;
  /** 每日完成位图（true/false，按天顺序），用于迷你柱状图 */
  days: boolean[];
};

export type TaskCardSnapshot = {
  /** 卡片标题（如"本周待办"） */
  title: string;
  /** 任务总数 */
  total: number;
  /** 已完成数 */
  completed: number;
};

// ---------- 序列化 ----------

export function encodeSnapshot(data: unknown): string {
  return Buffer.from(JSON.stringify(data), "utf-8").toString("base64url");
}

export function decodeSnapshot<T>(encoded: string): T | null {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as T;
  } catch {
    return null;
  }
}

// ---------- 标记生成（编辑器"插入数据卡片"用）----------

export function buildHabitCardMarker(habitId: string, snapshot: HabitCardSnapshot): string {
  return `:::habit-summary{habitId="${habitId}" range="${snapshot.range}" snapshot="${encodeSnapshot(snapshot)}"}`;
}

export function buildTaskCardMarker(taskId: string, snapshot: TaskCardSnapshot): string {
  return `:::task-progress{taskId="${taskId}" snapshot="${encodeSnapshot(snapshot)}"}`;
}

// ---------- 解析 ----------

export type ParsedCard =
  | { type: "habit"; habitId: string; range: string; snapshot: HabitCardSnapshot | null }
  | { type: "task"; taskId: string; snapshot: TaskCardSnapshot | null };

const HABIT_RE = /^:::habit-summary\{([^}]*)\}$/s;
const TASK_RE = /^:::task-progress\{([^}]*)\}$/s;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const key = m[1];
    const value = m[2];
    if (key !== undefined && value !== undefined) attrs[key] = value;
  }
  return attrs;
}

/** 解析一行完整的指令文本（仅当整段就是一个卡片标记时生效） */
export function parseDataCard(text: string): ParsedCard | null {
  const trimmed = text.trim();
  const habit = HABIT_RE.exec(trimmed);
  if (habit) {
    const attrs = parseAttrs(habit[1] ?? "");
    return {
      type: "habit",
      habitId: attrs.habitId ?? "",
      range: attrs.range ?? "week",
      snapshot: attrs.snapshot ? decodeSnapshot<HabitCardSnapshot>(attrs.snapshot) : null,
    };
  }
  const task = TASK_RE.exec(trimmed);
  if (task) {
    const attrs = parseAttrs(task[1] ?? "");
    return {
      type: "task",
      taskId: attrs.taskId ?? "",
      snapshot: attrs.snapshot ? decodeSnapshot<TaskCardSnapshot>(attrs.snapshot) : null,
    };
  }
  return null;
}

// ---------- 渲染节点构建（hast；值以文本节点组装，自动实体转义）----------

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function el(tagName: string, properties: Record<string, unknown>, children: HastNode[]): HastNode {
  return { type: "element", tagName, properties, children };
}

function txt(value: string): HastNode {
  return { type: "text", value };
}

/** 降级占位（数据不可用时不报错、不空白） */
function fallbackCard(kind: string): HastNode {
  return el("div", { className: ["data-card", "data-card-fallback"] }, [
    txt(`（该${kind === "habit" ? "打卡" : "任务"}数据已不可用）`),
  ]);
}

export function buildHabitCardNodes(parsed: Extract<ParsedCard, { type: "habit" }>): HastNode {
  const snap = parsed.snapshot;
  if (!snap) return fallbackCard("habit");
  const rangeLabel = snap.range === "month" ? "本月" : "本周";

  const bars: HastNode[] = snap.days.map((done) =>
    el("span", { className: [done ? "data-card-bar data-card-bar-on" : "data-card-bar"] }, []),
  );

  const children: HastNode[] = [
    el("div", { className: ["data-card-head"] }, [
      el("span", { className: ["data-card-kind"] }, [txt("习惯打卡")]),
      el("span", { className: ["data-card-title"] }, [txt(snap.name)]),
    ]),
    el("div", { className: ["data-card-value"] }, [
      txt(`${snap.done} / ${snap.target} 天`),
      el("span", { className: ["data-card-range"] }, [txt(rangeLabel)]),
    ]),
  ];
  if (bars.length > 0) {
    children.push(el("div", { className: ["data-card-bars"] }, bars));
  }

  return el("div", { className: ["data-card", "data-card-habit"] }, children);
}

export function buildTaskCardNodes(parsed: Extract<ParsedCard, { type: "task" }>): HastNode {
  const snap = parsed.snapshot;
  if (!snap) return fallbackCard("task");
  const pct = snap.total > 0 ? Math.round((snap.completed / snap.total) * 100) : 0;

  return el("div", { className: ["data-card", "data-card-task"] }, [
    el("div", { className: ["data-card-head"] }, [
      el("span", { className: ["data-card-kind"] }, [txt("任务进度")]),
      el("span", { className: ["data-card-title"] }, [txt(snap.title)]),
    ]),
    el("div", { className: ["data-card-value"] }, [txt(`${snap.completed} / ${snap.total} 项`), el("span", { className: ["data-card-range"] }, [txt(`完成 ${pct}%`)])]),
    el("div", { className: ["data-card-progress"] }, [
      el("span", { className: ["data-card-progress-fill"], style: `width:${pct}%` }, []),
    ]),
  ]);
}

/** 统一入口：解析失败/非卡片返回 null，由调用方保留原文本 */
export function buildDataCardNodes(text: string): HastNode | null {
  const parsed = parseDataCard(text);
  if (!parsed) return null;
  return parsed.type === "habit" ? buildHabitCardNodes(parsed) : buildTaskCardNodes(parsed);
}
