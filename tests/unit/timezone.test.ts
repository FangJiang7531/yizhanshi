import { describe, expect, it } from "vitest";
import {
  toLocalDateString,
  getDayRangeInTimezone,
  parseDateStrToUtcDate,
  utcDateToDateStr,
  daysOfMonth,
} from "@/lib/date/timezone";

/**
 * 时区正确性测试（PRD 附录 B，B-11 / B-12 —— 核心用例）。
 * 目标：证明"打卡日期按用户当地日期记录，不随 UTC 漂移"。
 */

describe("toLocalDateString（UTC 时刻 → 用户时区日期串）", () => {
  it("B-11 America/New_York 本地 23:30 打卡 → 记录纽约当地日期，不是 UTC 日期", () => {
    // 纽约 2026-10-05 23:30 (EDT, UTC-4) = UTC 2026-10-06T03:30
    const instant = new Date("2026-10-06T03:30:00.000Z");
    expect(toLocalDateString(instant, "America/New_York")).toBe("2026-10-05");
    // 而 UTC 日期是 10-06 —— 正是要避免的漂移
    expect(utcDateToDateStr(instant)).toBe("2026-10-06");
  });

  it("B-12 Asia/Shanghai 本地 00:30 打卡 → 记录当天，不是前一天", () => {
    // 上海 2026-10-05 00:30 (UTC+8) = UTC 2026-10-04T16:30
    const instant = new Date("2026-10-04T16:30:00.000Z");
    expect(toLocalDateString(instant, "Asia/Shanghai")).toBe("2026-10-05");
    // UTC 日期是 10-04 —— 若不做时区换算就会记错一天
    expect(utcDateToDateStr(instant)).toBe("2026-10-04");
  });

  it("同一时刻在不同时区得到不同当地日期", () => {
    const instant = new Date("2026-10-05T18:00:00.000Z");
    expect(toLocalDateString(instant, "Asia/Shanghai")).toBe("2026-10-06"); // +8 → 次日 02:00
    expect(toLocalDateString(instant, "America/New_York")).toBe("2026-10-05"); // -4 → 当日 14:00
    expect(toLocalDateString(instant, "UTC")).toBe("2026-10-05");
  });
});

describe("getDayRangeInTimezone（用户时区「今天」的 UTC 起止）", () => {
  it("上海某天的 UTC 范围应为当地 00:00–23:59:59.999", () => {
    const instant = new Date("2026-10-05T12:00:00.000Z");
    const { start, end, localDateStr } = getDayRangeInTimezone(instant, "Asia/Shanghai");
    expect(localDateStr).toBe("2026-10-05");
    expect(start.toISOString()).toBe("2026-10-04T16:00:00.000Z"); // 当地 10-05 00:00
    expect(end.toISOString()).toBe("2026-10-05T15:59:59.999Z"); // 当地 10-05 23:59:59.999
  });

  it("范围覆盖整日：起点与终点之差应为 24 小时减 1ms", () => {
    const { start, end } = getDayRangeInTimezone(new Date("2026-10-05T12:00:00.000Z"), "America/New_York");
    expect(end.getTime() - start.getTime()).toBe(86_400_000 - 1);
  });
});

describe("@db.Date 存取约定", () => {
  it("parseDateStrToUtcDate 把日期串解释为 UTC 午夜（不引入时区再解释）", () => {
    const d = parseDateStrToUtcDate("2026-10-05");
    expect(d.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("utcDateToDateStr 用 UTC 分量还原日期串（往返一致）", () => {
    const original = "2026-10-05";
    expect(utcDateToDateStr(parseDateStrToUtcDate(original))).toBe(original);
  });

  it("非法日期串抛错", () => {
    expect(() => parseDateStrToUtcDate("2026/10/05")).toThrow();
    expect(() => parseDateStrToUtcDate("2026-1-5")).toThrow();
  });
});

describe("daysOfMonth（热力图数据源）", () => {
  it("闰年 2 月 → 29 天", () => {
    expect(daysOfMonth("2024-02-15")).toHaveLength(29);
  });

  it("平年 2 月 → 28 天", () => {
    expect(daysOfMonth("2026-02-15")).toHaveLength(28);
  });

  it("10 月 → 31 天，首尾正确", () => {
    const days = daysOfMonth("2026-10-15");
    expect(days).toHaveLength(31);
    expect(days[0]).toBe("2026-10-01");
    expect(days[days.length - 1]).toBe("2026-10-31");
  });
});
