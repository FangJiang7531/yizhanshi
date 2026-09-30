/**
 * 字数与阅读时长统计（PRD B-13 / 制作流程 Step 1.2）
 * - 中文按字符计，英文按单词计
 * - 阅读时长按中文 400 字/分钟估算，向上取整，最少 1
 *
 * B-13：5000 字中文正文 → readingMinutes = 13（5000/400 = 12.5 → ceil）
 */

/** 匹配连续拉丁字母/数字串（视为一个"词"） */
const LATIN_WORD_RE = /[A-Za-z0-9]+/g;
/** CJK 字符（含扩展 A、兼容表意） */
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;

export type ContentStats = {
  /** 中文字符数 + 英文单词数 */
  wordCount: number;
  /** 预计阅读分钟（≥1） */
  readingMinutes: number;
};

/** 剥离 Markdown 语法符号后再统计（避免把 #、*、`、链接语法算进正文） */
export function stripMarkdownSyntax(md: string): string {
  return md
    // 代码块内容也算正文（读者要读），保留内容去掉围栏
    .replace(/```[^\n]*\n?/g, "")
    // 图片整体剔除（alt 不算阅读字数），链接保留显示文本
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // 行内代码保留内容、去掉反引号
    .replace(/`+/g, "")
    // 标题/引用/列表/强调等标记符号
    .replace(/^\s{0,3}(#{1,6}|>|[-+*]|\d+\.)\s+/gm, "")
    .replace(/[*_~]/g, "");
}

export function calcStats(markdown: string): ContentStats {
  const text = stripMarkdownSyntax(markdown);
  const cjkCount = text.match(CJK_RE)?.length ?? 0;
  const latinWords = text.match(LATIN_WORD_RE)?.length ?? 0;
  const wordCount = cjkCount + latinWords;
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 400));
  return { wordCount, readingMinutes };
}
