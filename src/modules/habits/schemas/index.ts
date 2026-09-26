import { z } from "zod";

/** 习惯内置图标集（24 个，渲染见 components/habit-icon.tsx） */
export const HABIT_ICONS = [
  "flame", "dumbbell", "book-open", "droplets", "moon", "sun",
  "heart-pulse", "footprints", "apple", "bike", "pen-line", "music",
  "brush", "bed", "coffee", "brain", "laptop", "piggy-bank",
  "sprout", "target", "timer", "users", "languages", "check-circle",
] as const;

export type HabitIcon = (typeof HABIT_ICONS)[number];

/** 默认图标（HABIT_ICONS 首项；显式常量以便 noUncheckedIndexedAccess 下安全引用） */
export const DEFAULT_HABIT_ICON: HabitIcon = "flame";

export const HABIT_COLORS = [
  "#4A7C59", "#6366F1", "#B4543E", "#C08A3E", "#5B7A9D", "#A8552F",
  "#7C3AED", "#0E7490", "#BE185D", "#4D7C0F", "#B45309", "#334155",
];

/** 默认颜色（HABIT_COLORS 首项） */
export const DEFAULT_HABIT_COLOR = "#4A7C59";

export const createHabitSchema = z.object({
  name: z.string().trim().min(1, "请输入习惯名称").max(50, "名称最多 50 字"),
  description: z.string().trim().max(500, "描述最多 500 字").optional().or(z.literal("")),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "颜色格式不正确"),
  icon: z.enum(HABIT_ICONS),
  targetPerWeek: z.coerce.number().int().min(1, "每周目标至少 1 天").max(7, "每周目标最多 7 天").default(7),
});

export const updateHabitSchema = createHabitSchema.partial().extend({
  id: z.string().cuid(),
});

export const toggleHabitLogSchema = z.object({
  habitId: z.string().cuid(),
  /** 用户时区下的日期串 YYYY-MM-DD（服务端绝不自行推断“今天”） */
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式不正确"),
});

export const deleteHabitSchema = z.object({ id: z.string().cuid() });

export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
