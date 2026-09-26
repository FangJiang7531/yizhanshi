import { diffInDays, monthStartOf, previousDay, type DateStr } from "./timezone";

/**
 * streak 三函数（PRD §4.4 口径逐字固化，禁止自由发挥）。
 * 全部为纯函数：不查库、不取系统时间（参照日由参数传入），可被固定数据集测试。
 */

/**
 * 当前连续天数：从“今天”（用户时区）向前回溯。
 * - 今天已打卡 → 从今天数起
 * - 今天未打卡 → 从昨天数起（今天没打卡不算断连，给用户当天补打的机会）
 * - 遇到第一个未打卡日期即停止
 */
export function calcCurrentStreak(loggedDates: Set<DateStr>, todayInUserTz: DateStr): number {
  let cursor = todayInUserTz;
  let streak = 0;
  if (!loggedDates.has(cursor)) cursor = previousDay(cursor);
  while (loggedDates.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

/**
 * 最长连续天数：遍历升序日期，滑动窗口取最长连续区段。
 * 跨月、跨年、闰年天然连续（因为按“日期串差 1 天”判定，不按月份切分）。
 */
export function calcLongestStreak(loggedDates: DateStr[]): number {
  if (loggedDates.length === 0) return 0;
  const sorted = [...loggedDates].sort();
  const first = sorted[0];
  if (!first) return 0;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const prev = sorted[i - 1];
    if (!curr || !prev) continue;
    if (previousDay(curr) === prev) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

/**
 * 完成率：统计区间内打卡天数 ÷ 区间内应打卡天数。
 * 分母只算已过去的天数（rangeStart 到 min(referenceDate, 区间末)），不含未来，
 * 否则月初完成率会显示得极低。返回 0–1。
 */
export function calcCompletionRate(
  loggedDates: Set<DateStr>,
  rangeStart: DateStr,
  referenceDate: DateStr,
): number {
  if (referenceDate < rangeStart) return 0;
  const days = diffInDays(rangeStart, referenceDate) + 1;
  if (days <= 0) return 0;
  let hit = 0;
  for (const d of loggedDates) {
    if (d >= rangeStart && d <= referenceDate) hit += 1;
  }
  return hit / days;
}

/** 本月完成率的便捷封装：区间 = 本月 1 号 → 参照日 */
export function calcMonthlyCompletionRate(
  loggedDates: Set<DateStr>,
  referenceDate: DateStr,
): number {
  return calcCompletionRate(loggedDates, monthStartOf(referenceDate), referenceDate);
}
