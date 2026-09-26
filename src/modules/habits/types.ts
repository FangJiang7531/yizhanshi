import type { HabitIcon } from "./schemas";

/** 序列化后的习惯 DTO（含统计） */
export type HabitDTO = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: HabitIcon;
  targetPerWeek: number;
  /** 当前连续天数（口径见 PRD §4.4） */
  currentStreak: number;
  /** 最长连续天数 */
  longestStreak: number;
  /** 本月完成率 0–100 */
  completionRate: number;
  /** 当月已打卡的日期串集合（YYYY-MM-DD，供热力图渲染） */
  monthDates: string[];
  /** 今日是否已打卡 */
  checkedToday: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ToggleLogResult = {
  habitId: string;
  checked: boolean;
  currentStreak: number;
  longestStreak: number;
  completionRate: number;
};
