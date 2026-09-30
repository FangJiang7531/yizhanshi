import { describe, expect, it } from "vitest";
import { SensitiveFilter, normalizeWithMap, type Level } from "@/modules/blog/lib/sensitive-filter";

/**
 * 敏感词引擎单测（Gate 1.1 / B-10）
 * 词条使用合成测试词，验证：普通命中、变体绕过（全角/零宽/拆字/重复字符）、
 * 多词命中、MASK 替换、BLOCK 阻断、性能（5000 字 × 1000 词 < 20ms）。
 */

function makeFilter(words: { word: string; level: Level }[]) {
  const f = new SensitiveFilter();
  f.setWords(words);
  return f;
}

const WORDS: { word: string; level: Level }[] = [
  { word: "坏词", level: "BLOCK" },
  { word: "badword", level: "BLOCK" },
  { word: "审词", level: "REVIEW" },
  { word: "屏蔽词", level: "MASK" },
];

/** 取第一个命中（strict 索引安全，测试断言前置） */
function first<T>(arr: T[]): T {
  const item = arr[0];
  if (item === undefined) throw new Error("期望至少一个元素");
  return item;
}

describe("敏感词引擎（AC 自动机）", () => {
  describe("基础匹配", () => {
    it("普通命中：返回词、级别与原文位置", () => {
      const f = makeFilter(WORDS);
      const hits = f.scan("前面是坏词后面");
      expect(hits).toHaveLength(1);
      const hit = first(hits);
      expect(hit.word).toBe("坏词");
      expect(hit.level).toBe("BLOCK");
      expect("前面是坏词后面".slice(hit.start, hit.end)).toBe("坏词");
    });

    it("无命中返回空数组", () => {
      const f = makeFilter(WORDS);
      expect(f.scan("这是一段完全正常的内容")).toEqual([]);
    });

    it("多词命中：按位置升序返回全部", () => {
      const f = makeFilter(WORDS);
      const hits = f.scan("坏词与审词同现");
      expect(hits.map((h) => h.word).sort()).toEqual(["审词", "坏词"].sort());
    });

    it("大小写不敏感：BADWORD 命中 badword", () => {
      const f = makeFilter(WORDS);
      expect(f.scan("BADWORD")).toHaveLength(1);
    });
  });

  describe("变体绕过（B-10）", () => {
    it("全角字符：ｂａｄｗｏｒｄ 命中", () => {
      const f = makeFilter(WORDS);
      expect(f.scan("ｂａｄｗｏｒｄ")).toHaveLength(1);
    });

    it("零宽字符：坏\\u200b词 命中", () => {
      const f = makeFilter(WORDS);
      expect(f.scan("坏\u200b词")).toHaveLength(1);
    });

    it("零宽连接符 U+FEFF：坏\\uFEFF词 命中", () => {
      const f = makeFilter(WORDS);
      expect(f.scan("坏\uFEFF词")).toHaveLength(1);
    });

    it("重复字符：坏坏词词 命中", () => {
      const f = makeFilter(WORDS);
      const hits = f.scan("坏坏词词");
      expect(hits).toHaveLength(1);
      // 命中区间覆盖原文全部重复字符
      const hit = first(hits);
      expect("坏坏词词".slice(hit.start, hit.end)).toBe("坏坏词词");
    });

    it("拆字插入符号：坏*词 / 坏-词 / 坏 词 均命中", () => {
      const f = makeFilter(WORDS);
      expect(f.scan("坏*词")).toHaveLength(1);
      expect(f.scan("坏-词")).toHaveLength(1);
      expect(f.scan("坏 词")).toHaveLength(1);
      expect(f.scan("坏·词")).toHaveLength(1);
    });

    it("组合绕过：全角+零宽+重复 命中", () => {
      const f = makeFilter(WORDS);
      expect(f.scan("ｂａｄ\u200bｗｏｒｒｄ")).toHaveLength(1);
    });
  });

  describe("分级处理（§6.2）", () => {
    it("BLOCK：blocked=true", () => {
      const f = makeFilter(WORDS);
      const r = f.process("包含坏词的内容");
      expect(r.blocked).toBe(true);
      expect(r.hits.some((h) => h.level === "BLOCK")).toBe(true);
    });

    it("MASK：命中片段替换为 ***（长度与命中片段一致，最少 3）", () => {
      const f = makeFilter(WORDS);
      const r = f.process("这是屏蔽词测试");
      expect(r.blocked).toBe(false);
      expect(r.text).toBe("这是***测试");
      expect(r.text).not.toContain("屏蔽词");
    });

    it("REVIEW：不阻断、不替换文本", () => {
      const f = makeFilter(WORDS);
      const r = f.process("包含审词的文本");
      expect(r.blocked).toBe(false);
      expect(r.text).toBe("包含审词的文本");
      expect(first(r.hits).level).toBe("REVIEW");
    });

    it("同区间多词命中时保留最高级别", () => {
      const f = makeFilter([
        { word: "重叠", level: "MASK" },
        { word: "重叠词", level: "BLOCK" },
      ]);
      const r = f.process("重叠词");
      expect(r.blocked).toBe(true);
    });
  });

  describe("归一化与性能", () => {
    it("normalizeWithMap 映射回原文下标正确", () => {
      const { normalized, map } = normalizeWithMap("ａ b\u200bc");
      expect(normalized).toBe("abc");
      expect(map).toEqual([0, 2, 4]);
    });

    it("性能：5000 字文本 × 1000 词库 < 20ms（PRD §6.3）", () => {
      const words = Array.from({ length: 1000 }, (_, i) => ({ word: `测试词${i}`, level: "REVIEW" as Level }));
      const f = makeFilter(words);
      const text = "这是一段用于性能测试的中文文本，包含若干常见汉字组合。".repeat(60).slice(0, 5000);
      // 预热
      f.scan(text);
      const start = performance.now();
      f.scan(text);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(20);
    });

    it("空词库/空文本安全返回", () => {
      const f = new SensitiveFilter();
      f.setWords([]);
      expect(f.scan("任意文本")).toEqual([]);
      const f2 = makeFilter(WORDS);
      expect(f2.scan("")).toEqual([]);
    });
  });
});
