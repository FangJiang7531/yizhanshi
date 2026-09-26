import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

/** 日期字符串，格式 YYYY-MM-DD */
export type DateStr = string;

/** 把 UTC 时间转为用户时区下的日期字符串（YYYY-MM-DD） */
export function toLocalDateString(date: Date, timezone: string): DateStr {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}

/** 返回用户时区下“今天/某天”的 UTC 起止范围与本地日期串 */
export function getDayRangeInTimezone(date: Date, timezone: string): {
  start: Date;
  end: Date;
  localDateStr: DateStr;
} {
  const localDateStr = formatInTimeZone(date, timezone, "yyyy-MM-dd");
  const start = fromZonedTime(`${localDateStr}T00:00:00.000`, timezone);
  const end = fromZonedTime(`${localDateStr}T23:59:59.999`, timezone);
  return { start, end, localDateStr };
}

/** 用户时区下此刻的小时数（0–23），用于问候语 */
export function getLocalHour(date: Date, timezone: string): number {
  return Number(formatInTimeZone(date, timezone, "H"));
}

/**
 * @db.Date 列的存取约定：
 * - 写入：把 'YYYY-MM-DD' 解释为 UTC 午夜，避免任何时区再解释
 * - 读取：用 UTC 分量还原 'YYYY-MM-DD'
 */
export function parseDateStrToUtcDate(dateStr: DateStr): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`非法日期串：${dateStr}`);
  }
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function utcDateToDateStr(date: Date): DateStr {
  return date.toISOString().slice(0, 10);
}

// ---------- 纯日期串运算（全部基于 UTC 午夜，不依赖系统时区） ----------

export function previousDay(dateStr: DateStr): DateStr {
  const d = parseDateStrToUtcDate(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDateToDateStr(d);
}

export function nextDay(dateStr: DateStr): DateStr {
  const d = parseDateStrToUtcDate(dateStr);
  d.setUTCDate(d.getUTCDate() + 1);
  return utcDateToDateStr(d);
}

/** 两个日期串相差的天数（end - start，可为负） */
export function diffInDays(start: DateStr, end: DateStr): number {
  const a = parseDateStrToUtcDate(start).getTime();
  const b = parseDateStrToUtcDate(end).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** 日期串所在月份的第一天 */
export function monthStartOf(dateStr: DateStr): DateStr {
  return `${dateStr.slice(0, 7)}-01`;
}

/** 日期串所在月份的最后一天（正确处理闰年） */
export function monthEndOf(dateStr: DateStr): DateStr {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${dateStr.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}

/** 返回月份内全部日期串（1 号到月末） */
export function daysOfMonth(dateStr: DateStr): DateStr[] {
  const start = monthStartOf(dateStr);
  const end = monthEndOf(dateStr);
  const days: DateStr[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = nextDay(cursor);
  }
  return days;
}

/** 日期串是周几：0=周日 … 6=周六（weekStart 换算由调用方处理） */
export function weekdayOf(dateStr: DateStr): number {
  return parseDateStrToUtcDate(dateStr).getUTCDay();
}

/** 用户时区下某日期的展示文案：今天 / 明天 / 昨天 / M月D日 */
export function formatDueDate(dueAt: Date, timezone: string, now: Date): string {
  const dueDateStr = toLocalDateString(dueAt, timezone);
  const todayStr = toLocalDateString(now, timezone);
  if (dueDateStr === todayStr) return "今天";
  if (dueDateStr === nextDay(todayStr)) return "明天";
  if (dueDateStr === previousDay(todayStr)) return "昨天";
  const month = Number(dueDateStr.slice(5, 7));
  const day = Number(dueDateStr.slice(8, 10));
  return `${month}月${day}日`;
}
