import { describe, expect, it } from "vitest";
import {
  calcCurrentStreak,
  calcLongestStreak,
  calcCompletionRate,
  calcMonthlyCompletionRate,
} from "@/lib/date/streak";
import { previousDay, nextDay, monthEndOf } from "@/lib/date/timezone";

/**
 * streak 三函数纯函数测试（PRD 附录 B，B-01 ~ B-10）。
 * 固定数据集，不使用 new Date()：参照日全部显式传入。
 */

const set = (dates: string[]) => new Set(dates);

describe("calcCurrentStreak（当前连续天数）", () => {
  it("B-01 连续 3 天打卡，今天已打卡 → 3", () => {
    const dates = ["2026-10-03", "2026-10-04", "2026-10-05"];
    expect(calcCurrentStreak(set(dates), "2026-10-05")).toBe(3);
  });

  it("B-02 连续 3 天（截止昨天），今天未打卡 → 3（今天未打卡不算断）", () => {
    const dates = ["2026-10-02", "2026-10-03", "2026-10-04"];
    expect(calcCurrentStreak(set(dates), "2026-10-05")).toBe(3);
  });

  it("B-03 昨天未打卡，前天与大前天打卡 → 0", () => {
    const dates = ["2026-10-01", "2026-10-02"];
    expect(calcCurrentStreak(set(dates), "2026-10-04")).toBe(0);
  });

  it("B-05 只有一天打卡（今天）→ 1", () => {
    expect(calcCurrentStreak(set(["2026-10-05"]), "2026-10-05")).toBe(1);
  });

  it("B-06 无打卡记录 → 0", () => {
    expect(calcCurrentStreak(set([]), "2026-10-05")).toBe(0);
  });

  it("今天未打卡且昨天也未打卡 → 0", () => {
    expect(calcCurrentStreak(set(["2026-09-30"]), "2026-10-05")).toBe(0);
  });
});

describe("calcLongestStreak（最长连续天数）", () => {
  it("B-04 打卡 10/1–10/5 与 10/8–10/12 → 最长连续 = 5", () => {
    const dates = [
      "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05",
      "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12",
    ];
    expect(calcLongestStreak(dates)).toBe(5);
  });

  it("B-05 只有一天 → 1", () => {
    expect(calcLongestStreak(["2026-10-05"])).toBe(1);
  });

  it("B-06 无记录 → 0", () => {
    expect(calcLongestStreak([])).toBe(0);
  });

  it("B-08 跨月边界：上月 30、31 + 本月 1、2 → 4（不因跨月断开）", () => {
    const dates = ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];
    // 9/30 与 10/1 相邻 → 连续 4 天
    expect(calcLongestStreak(dates)).toBe(4);
  });

  it("B-09 跨年边界：12/31 与 1/1 → 2", () => {
    expect(calcLongestStreak(["2025-12-31", "2026-01-01"])).toBe(2);
  });

  it("B-10 闰年：2024-02-28 与 2024-02-29 → 2", () => {
    expect(calcLongestStreak(["2024-02-28", "2024-02-29"])).toBe(2);
  });

  it("闰年 2/28 与 3/1（跳过 2/29）→ 不连续，最长 1", () => {
    // 2023 非闰年：2/28 与 3/1 相邻 → 2；用 2024 闰年 2/28 与 3/1 中间隔着 2/29
    expect(calcLongestStreak(["2024-02-28", "2024-03-01"])).toBe(1);
  });

  it("乱序输入不影响结果", () => {
    const dates = ["2026-10-03", "2026-10-01", "2026-10-02"];
    expect(calcLongestStreak(dates)).toBe(3);
  });

  it("取最长区段而非第一段", () => {
    const dates = ["2026-10-01", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
    expect(calcLongestStreak(dates)).toBe(4);
  });
});

describe("calcCompletionRate（完成率）", () => {
  it("B-07 本月第 3 天，已打卡 2 天 → 2/3 ≈ 66.7%（分母不含未来）", () => {
    const dates = ["2026-10-01", "2026-10-02"];
    const rate = calcCompletionRate(set(dates), "2026-10-01", "2026-10-03");
    expect(rate).toBeCloseTo(2 / 3, 5);
  });

  it("B-06 无打卡 → 0", () => {
    expect(calcCompletionRate(set([]), "2026-10-01", "2026-10-10")).toBe(0);
  });

  it("本月每天打卡到今天 → 100%", () => {
    const dates = ["2026-10-01", "2026-10-02", "2026-10-03"];
    expect(calcCompletionRate(set(dates), "2026-10-01", "2026-10-03")).toBe(1);
  });

  it("参照日早于区间起点 → 0", () => {
    expect(calcCompletionRate(set(["2026-10-01"]), "2026-10-05", "2026-10-01")).toBe(0);
  });

  it("区间外的打卡不计入分子", () => {
    const dates = ["2026-09-30", "2026-10-01", "2026-10-02"];
    // 区间 10/1–10/3，9/30 在区间外
    expect(calcCompletionRate(set(dates), "2026-10-01", "2026-10-03")).toBeCloseTo(2 / 3, 5);
  });

  it("calcMonthlyCompletionRate 与显式区间一致", () => {
    const dates = ["2026-10-01", "2026-10-02"];
    const viaHelper = calcMonthlyCompletionRate(set(dates), "2026-10-03");
    const viaExplicit = calcCompletionRate(set(dates), "2026-10-01", "2026-10-03");
    expect(viaHelper).toBe(viaExplicit);
  });
});

describe("日期串工具（streak 的基石，必须跨月/跨年/闰年正确）", () => {
  it("previousDay 跨月：2026-10-01 → 2026-09-30", () => {
    expect(previousDay("2026-10-01")).toBe("2026-09-30");
  });

  it("previousDay 跨年：2026-01-01 → 2025-12-31", () => {
    expect(previousDay("2026-01-01")).toBe("2025-12-31");
  });

  it("previousDay 闰年：2024-03-01 → 2024-02-29", () => {
    expect(previousDay("2024-03-01")).toBe("2024-02-29");
  });

  it("nextDay 闰年：2024-02-28 → 2024-02-29", () => {
    expect(nextDay("2024-02-28")).toBe("2024-02-29");
  });

  it("monthEndOf 平年 2 月 → 28", () => {
    expect(monthEndOf("2023-02-10")).toBe("2023-02-28");
  });

  it("monthEndOf 闰年 2 月 → 29", () => {
    expect(monthEndOf("2024-02-10")).toBe("2024-02-29");
  });

  it("monthEndOf 小月 4 月 → 30", () => {
    expect(monthEndOf("2026-04-15")).toBe("2026-04-30");
  });
});
