/**
 * 敏感词引擎（PRD §6.3 / 制作流程 Step 1.1）
 *
 * 算法：前缀树（Trie）+ Aho-Corasick 多模式匹配，O(n) 复杂度，与词库规模无关。
 * 禁止逐词 includes（O(n×m) 且无法返回命中位置）——AC 自动机是该场景的标准解法。
 *
 * 归一化（防谐音/变体/拆字绕过，匹配前必须执行）：
 *   全角→半角 → 去零宽字符 → 去空白与符号（拆字插入物）→ 统一小写 → 压缩重复字符
 * 归一化折损了字符数量，因此维护 normalizedIdx → 原文索引 的映射，命中位置可精确还原到原文。
 */

export type Level = "BLOCK" | "REVIEW" | "MASK";

export type SensitiveWordInput = { word: string; level: Level };

export type Hit = {
  /** 词库中的规范词 */
  word: string;
  level: Level;
  /** 命中区间在「原文」中的起始下标（含） */
  start: number;
  /** 命中区间在「原文」中的结束下标（不含） */
  end: number;
  /** 原文中被命中的片段 */
  matched: string;
};

const LEVEL_PRIORITY: Record<Level, number> = { BLOCK: 3, REVIEW: 2, MASK: 1 };

/** 零宽字符与控制字符（含 U+200B–U+200F、U+2060、U+FEFF） */
const ZERO_WIDTH = /[\u200B-\u200F\u2060\uFEFF\u00AD]/;

/** 保留字符：字母（含 CJK）、数字。其余（空白/标点/符号/emoji）在归一化中剔除 */
function isKeptChar(cp: number): boolean {
  if (cp >= 0x30 && cp <= 0x39) return true; // 0-9
  if (cp >= 0x61 && cp <= 0x7a) return true; // a-z（小写化后）
  if (cp >= 0x41 && cp <= 0x5a) return true; // A-Z
  if (cp >= 0x4e00 && cp <= 0x9fff) return true; // CJK 基本区
  if (cp >= 0x3400 && cp <= 0x4dbf) return true; // CJK 扩展 A
  if (cp >= 0xf900 && cp <= 0xfaff) return true; // CJK 兼容表意
  if (cp >= 0x3040 && cp <= 0x30ff) return true; // 日文假名（常见混排）
  if (cp >= 0xac00 && cp <= 0xd7af) return true; // 谚文
  return false;
}

/** 全角 → 半角（ASCII 可见区 + 表意空格） */
function toHalfWidth(cp: number): number {
  if (cp === 0x3000) return 0x20;
  if (cp >= 0xff01 && cp <= 0xff5e) return cp - 0xfee0;
  return cp;
}

export type NormalizedText = {
  /** 归一化后的文本（压缩重复字符后可能变短） */
  normalized: string;
  /** normalized[i] 对应原文的下标 */
  map: number[];
};

/**
 * 归一化并建立索引映射。
 * 注意：压缩重复字符发生在归一化流上（"法法轮" → "法轮"），这是防"重复字符绕过"的关键一步。
 */
export function normalizeWithMap(input: string): NormalizedText {
  const chars: string[] = [];
  const map: number[] = [];

  for (let i = 0; i < input.length; ) {
    const cp = input.codePointAt(i);
    if (cp === undefined) break;
    const width = cp > 0xffff ? 2 : 1;
    const ch = input.slice(i, i + width);

    if (ZERO_WIDTH.test(ch)) {
      i += width;
      continue;
    }
    let half = toHalfWidth(cp);
    if (half >= 0x41 && half <= 0x5a) half += 0x20; // toLowerCase
    if (!isKeptChar(half)) {
      i += width;
      continue; // 剔除空白/标点/符号（拆字绕过插入物）
    }
    const out = String.fromCodePoint(half);
    // 压缩连续重复字符（"法法轮"→"法轮"、"测测测试"→"测试"）
    if (chars.length > 0 && chars[chars.length - 1] === out) {
      i += width;
      continue;
    }
    chars.push(out);
    map.push(i);
    i += width;
  }
  return { normalized: chars.join(""), map };
}

class TrieNode {
  children = new Map<string, TrieNode>();
  fail: TrieNode | null = null;
  /** 词库命中：该节点结尾的词与级别（多词可共享节点，仅存最高优先级） */
  word: string | null = null;
  level: Level | null = null;
  /** 该词的归一化长度（字符数），用于还原命中起点 */
  normalizedLen = 0;
  /** 经由 fail 链继承的输出（AC 标准做法：output link） */
  output: TrieNode | null = null;
}

export class SensitiveFilter {
  private root = new TrieNode();
  private size = 0;

  /** 用词条重建（启动加载 / 词库变更后 reload / 单测注入） */
  setWords(words: SensitiveWordInput[]): void {
    this.root = new TrieNode();
    this.size = 0;
    for (const { word, level } of words) {
      const { normalized } = normalizeWithMap(word);
      if (!normalized) continue; // 归一化后为空的词条直接忽略
      this.insert(normalized, word, level);
      this.size += 1;
    }
    this.buildFailureLinks();
  }

  get wordCount(): number {
    return this.size;
  }

  private insert(normalizedWord: string, rawWord: string, level: Level): void {
    let node = this.root;
    for (const ch of normalizedWord) {
      let next = node.children.get(ch);
      if (!next) {
        next = new TrieNode();
        node.children.set(ch, next);
      }
      node = next;
    }
    // 同一节点被多词共享时保留更高优先级（BLOCK > REVIEW > MASK）
    if (node.word === null || LEVEL_PRIORITY[level] > LEVEL_PRIORITY[node.level ?? "MASK"]) {
      node.word = rawWord;
      node.level = level;
      node.normalizedLen = normalizedWord.length;
    }
  }

  private buildFailureLinks(): void {
    const queue: TrieNode[] = [];
    for (const child of this.root.children.values()) {
      child.fail = this.root;
      // output = fail 链上最近的"词结尾"节点（不含自身；自身由 scan 直接检查）
      child.output = child.fail.word ? child.fail : null;
      queue.push(child);
    }
    while (queue.length > 0) {
      const current = queue.shift() as TrieNode;
      for (const [ch, child] of current.children) {
        // 沿 fail 链找到包含 ch 转移的祖先
        let fail = current.fail;
        while (fail && !fail.children.has(ch)) fail = fail.fail;
        child.fail = fail ? fail.children.get(ch) ?? this.root : this.root;
        child.output = child.fail.word ? child.fail : child.fail.output;
        queue.push(child);
      }
    }
  }

  /**
   * 多模式匹配。
   * @returns 按原文区间升序的命中列表（同一区间去重，保留最高级别）
   */
  scan(text: string): Hit[] {
    if (this.size === 0 || text.length === 0) return [];
    const { normalized, map } = normalizeWithMap(text);
    if (normalized.length === 0) return [];

    const rawHits: Hit[] = [];
    let node: TrieNode | null = this.root;

    const report = (n: TrieNode, endIndex: number): void => {
      if (!n.word || !n.level || n.normalizedLen <= 0) return;
      const startNorm = endIndex - n.normalizedLen + 1;
      const endChar = normalized[endIndex];
      let end = (map[endIndex] ?? text.length - 1) + 1;
      // 向后吞并"被压缩的重复字符"与零宽字符：保证高亮覆盖完整原文（重复字符绕过场景）
      const lastKeptChar = endChar;
      while (end < text.length) {
        const cp = text.codePointAt(end);
        if (cp === undefined) break;
        const width = cp > 0xffff ? 2 : 1;
        const ch = text.slice(end, end + width);
        if (ZERO_WIDTH.test(ch)) {
          end += width;
          continue;
        }
        let half = toHalfWidth(cp);
        if (half >= 0x41 && half <= 0x5a) half += 0x20;
        if (isKeptChar(half) && String.fromCodePoint(half) === lastKeptChar) {
          end += width;
          continue;
        }
        break;
      }
      rawHits.push({
        word: n.word,
        level: n.level,
        start: map[startNorm] ?? 0,
        end,
        matched: "",
      });
    };

    for (let i = 0; i < normalized.length; i++) {
      const ch = normalized[i];
      if (ch === undefined) continue;
      while (node && !node.children.has(ch)) node = node.fail;
      node = node ? node.children.get(ch) ?? this.root : this.root;

      // 先检查当前节点自身，再沿 output 链收集（output 不含自身，无自引用）
      report(node, i);
      let out = node.output;
      while (out) {
        report(out, i);
        out = out.output;
      }
    }

    // 还原 matched 字段（原文片段）
    for (const h of rawHits) {
      h.matched = text.slice(h.start, h.end);
    }

    return dedupeHits(rawHits);
  }

  /**
   * 按级别处理文本（PRD §6.2）：
   * - BLOCK：blocked = true，调用方应拒绝写入
   * - MASK：命中片段替换为 ***，返回处理后的文本
   * - REVIEW：不阻断，由调用方置为待审
   */
  process(text: string): { text: string; hits: Hit[]; blocked: boolean } {
    const hits = this.scan(text);
    const blocked = hits.some((h) => h.level === "BLOCK");

    // MASK 替换：从后往前替换避免下标漂移
    const maskRanges = hits.filter((h) => h.level === "MASK");
    let output = text;
    for (const h of [...maskRanges].sort((a, b) => b.start - a.start)) {
      output = output.slice(0, h.start) + "*".repeat(Math.max(3, h.end - h.start)) + output.slice(h.end);
    }

    return { text: output, hits, blocked };
  }
}

/** 同一区间去重取最高级别；不同词命中同区间时保留级别最高者 */
function dedupeHits(hits: Hit[]): Hit[] {
  const byRange = new Map<string, Hit>();
  for (const h of hits) {
    const key = `${h.start}:${h.end}`;
    const prev = byRange.get(key);
    if (!prev || LEVEL_PRIORITY[h.level] > LEVEL_PRIORITY[prev.level]) {
      byRange.set(key, h);
    }
  }
  return [...byRange.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

/** 进程内单例（词库变更后调用 reload() 重建） */
const globalStore = globalThis as unknown as { __pwbSensitiveFilter?: SensitiveFilter };

export const sensitiveFilter: SensitiveFilter =
  globalStore.__pwbSensitiveFilter ?? (globalStore.__pwbSensitiveFilter = new SensitiveFilter());

/** 词库加载状态（挂 globalThis，避免 dev 热重载时丢失"已加载"标记而重复查库） */
type LoadState = { loaded: boolean; loading: Promise<number> | null };
const loadStateStore = globalThis as unknown as { __pwbSensitiveLoadState?: LoadState };
const loadState: LoadState = (loadStateStore.__pwbSensitiveLoadState ??= { loaded: false, loading: null });

/** 从数据库加载词库（应用启动 / 管理端变更后调用） */
export async function loadSensitiveWords(): Promise<number> {
  const { prisma } = await import("@/lib/db");
  const rows = await prisma.sensitiveWord.findMany({
    where: { enabled: true },
    select: { word: true, level: true },
  });
  sensitiveFilter.setWords(rows.map((r) => ({ word: r.word, level: r.level as Level })));
  loadState.loaded = true;
  return rows.length;
}

/**
 * 惰性加载保障：任何审核入口在使用词库前调用一次。
 *
 * 为什么需要它：词库空载时 `scan()` 恒返回空数组，审核会**静默失效**——
 * 这是最危险的一类 bug（不报错，但防线消失）。这里用"未加载则加载一次"兜底，
 * 与 instrumentation 的启动加载形成双保险（后者失败也不影响前者生效）。
 */
export async function ensureSensitiveWordsLoaded(): Promise<void> {
  if (loadState.loaded) return;
  loadState.loading ??= loadSensitiveWords().finally(() => {
    loadState.loading = null;
  });
  await loadState.loading;
}

/** 仅供测试重置（模拟"应用冷启动、词库尚未加载"） */
export function __resetSensitiveWordsLoadedForTest(): void {
  loadState.loaded = false;
  loadState.loading = null;
}
