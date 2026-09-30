import { describe, expect, it } from "vitest";
import { normalizeToc } from "@/modules/blog/lib/markdown";
import { formatCount, formatDate, formatReadingTime, isoDateOnly, truncate } from "@/modules/blog/lib/format";

/**
 * 公开页的两个纯函数子系统：
 * 1. 目录数据归一化 —— `toc` 是 Json 列，形状不可信；
 * 2. 展示格式化 —— 公开页是共享缓存，"相对时间"会随缓存撒谎，所以必须走绝对日期。
 */

describe("normalizeToc（Json 列读取的安全边界）", () => {
  it("合法数据原样通过", () => {
    const toc = [
      { depth: 2, text: "第一节", id: "第一节" },
      { depth: 3, text: "子节", id: "子节" },
    ];
    expect(normalizeToc(toc)).toEqual(toc);
  });

  it("非数组一律返回空目录（不给页面抛错的机会）", () => {
    for (const bad of [null, undefined, "[]", 42, {}, { 0: {} }]) {
      expect(normalizeToc(bad)).toEqual([]);
    }
  });

  it("逐项校验：非法项被丢弃而不是让整页 500", () => {
    const raw = [
      { depth: 2, text: "合法", id: "合法" },
      { depth: 4, text: "深度不合法", id: "x" }, // 只收 h2/h3
      { depth: 2, text: 123, id: "y" }, // text 必须是字符串
      { depth: 2, text: "缺 id" }, // id 必填
      null,
      "字符串项",
    ];
    expect(normalizeToc(raw)).toEqual([{ depth: 2, text: "合法", id: "合法" }]);
  });
});

describe("formatDate / isoDateOnly（固定 Asia/Shanghai）", () => {
  it("按上海时区显示日期，且不因运行环境时区改变", () => {
    // 2026-09-30T20:00:00Z = 上海 2026-10-01 04:00
    expect(formatDate("2026-09-30T20:00:00.000Z")).toBe("2026年10月1日");
    // 2026-09-30T10:00:00Z = 上海 2026-09-30 18:00
    expect(formatDate("2026-09-30T10:00:00.000Z")).toBe("2026年9月30日");
  });

  it("isoDateOnly 输出机器可读的 YYYY-MM-DD（<time datetime> 用）", () => {
    expect(isoDateOnly("2026-09-30T10:00:00.000Z")).toBe("2026-09-30");
  });

  it("空值与非法值返回空串而不是 Invalid Date", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate("not-a-date")).toBe("");
    expect(isoDateOnly(undefined)).toBe("");
  });
});

describe("formatCount / formatReadingTime / truncate", () => {
  it("计数缩写", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1000)).toBe("1k");
    expect(formatCount(1234)).toBe("1.2k");
    expect(formatCount(12_400)).toBe("12k");
  });

  it("阅读时长不足 1 分钟也显示 1 分钟", () => {
    expect(formatReadingTime(0)).toBe("1 分钟");
    expect(formatReadingTime(13)).toBe("13 分钟");
  });

  it("截断按字符计（中文标题不会被字节切坏）", () => {
    expect(truncate("短标题", 10)).toBe("短标题");
    expect(truncate("一二三四五六七八九十", 5)).toBe("一二三四…");
  });
});
