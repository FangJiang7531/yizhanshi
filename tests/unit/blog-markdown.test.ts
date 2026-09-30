import { describe, expect, it } from "vitest";
import { renderMarkdown, renderCommentMarkdown } from "@/modules/blog/lib/markdown";
import { calcStats, stripMarkdownSyntax } from "@/modules/blog/lib/stats";
import { slugify, isValidSlug } from "@/modules/blog/lib/slug";

/**
 * Markdown 渲染管线单测（Gate 1.2 / B-11 / B-12）
 * 安全断言：原始 HTML 从源头被转义为纯文本（不使用 rehype-raw）。
 */
describe("Markdown 渲染管线", () => {
  describe("XSS 净化（B-11 / B-12）", () => {
    it("<script> 载荷不出现可执行标签", async () => {
      const { html } = await renderMarkdown("正常文字\n\n<script>alert(1)</script>");
      expect(html).not.toContain("<script");
      // 被转义为纯文本显示（PRD §5.2.3 期望行为；实体形式为 &#x3C; 或 &lt; 均可）
      expect(html).toMatch(/&#x3C;script|&lt;script/);
    });

    it("<img onerror> 载荷不产生带事件属性的 img 标签", async () => {
      const { html } = await renderMarkdown("正文\n\n<img src=x onerror=alert(1)>");
      expect(html).not.toMatch(/<img[^>]*onerror/i);
      expect(html).not.toContain("<img");
    });

    it("javascript: 链接协议被剥离", async () => {
      const { html } = await renderMarkdown("[点我](javascript:alert(1))");
      expect(html).not.toContain("javascript:");
    });

    it("iframe 载荷被转义", async () => {
      const { html } = await renderMarkdown('<iframe src="https://evil.example"></iframe>');
      expect(html).not.toContain("<iframe");
    });
  });

  describe("GFM 渲染（A-05）", () => {
    it("表格渲染且被 .table-scroll 包裹", async () => {
      const { html } = await renderMarkdown("| A | B |\n| - | - |\n| 1 | 2 |");
      expect(html).toContain("<table>");
      expect(html).toContain('class="table-scroll"');
    });

    it("任务列表渲染为只读 checkbox", async () => {
      const { html } = await renderMarkdown("- [x] 已完成\n- [ ] 未完成");
      expect(html).toContain('type="checkbox"');
      expect(html).toContain("disabled");
    });

    it("删除线与代码块高亮", async () => {
      const { html } = await renderMarkdown("~~删除线~~\n\n```js\nconst a = 1;\n```");
      expect(html).toContain("<del>");
      expect(html).toContain("hljs");
      expect(html).toContain("language-js");
    });

    it("引用块正常渲染", async () => {
      const { html } = await renderMarkdown("> 引用内容");
      expect(html).toContain("<blockquote>");
    });
  });

  describe("目录与外链", () => {
    it("h2/h3 注入 id 并收集目录；h1 不入目录", async () => {
      const { html, toc } = await renderMarkdown("# 大标题\n\n## 章节一\n\n### 小节\n\n## 章节二");
      expect(toc.map((t) => t.text)).toEqual(["章节一", "小节", "章节二"]);
      expect(toc[0]?.depth).toBe(2);
      expect(toc[1]?.depth).toBe(3);
      expect(html).toContain('id="章节一"');
    });

    it("重复标题 id 追加序号", async () => {
      const { toc } = await renderMarkdown("## 重复\n\n## 重复");
      expect(toc[0]?.id).toBe("重复");
      expect(toc[1]?.id).toBe("重复-1");
    });

    it("外链加 rel=noopener noreferrer（C-11），站内相对链接不加", async () => {
      const { html } = await renderMarkdown("[外](https://example.com) [内](/blog)");
      expect(html).toMatch(/href="https:\/\/example\.com"[^>]*rel="noopener noreferrer"/);
      expect(html).not.toMatch(/href="\/blog"[^>]*rel="noopener noreferrer"/);
    });

    it("图片注入 loading=lazy", async () => {
      const { html } = await renderMarkdown("![图](https://example.com/a.png)");
      expect(html).toContain('loading="lazy"');
    });
  });

  describe("评论轻量渲染", () => {
    it("允许加粗/斜体/行内代码/链接", async () => {
      const html = await renderCommentMarkdown("**粗** *斜* `代码` [链接](https://a.com)");
      expect(html).toContain("<strong>");
      expect(html).toContain("<em>");
      expect(html).toContain("<code>");
      expect(html).toContain("<a ");
    });

    it("评论中禁用图片与标题", async () => {
      const html = await renderCommentMarkdown("# 标题\n\n![图](https://a.com/x.png)");
      expect(html).not.toContain("<h1");
      expect(html).not.toContain("<img");
    });

    it("评论中的原始 HTML 被转义", async () => {
      const html = await renderCommentMarkdown("<script>alert(1)</script>");
      expect(html).not.toContain("<script");
    });
  });
});

describe("字数与阅读时长（B-13）", () => {
  it("5000 字中文正文 → readingMinutes = 13", () => {
    const md = "打卡".repeat(2500); // 5000 个 CJK 字符
    const { wordCount, readingMinutes } = calcStats(md);
    expect(wordCount).toBe(5000);
    expect(readingMinutes).toBe(13);
  });

  it("短文本最少 1 分钟", () => {
    expect(calcStats("你好").readingMinutes).toBe(1);
  });

  it("中英混排：中文按字符、英文按单词", () => {
    const { wordCount } = calcStats("你好 world hello 世界");
    expect(wordCount).toBe(2 + 2 + 2); // 你好(2) + world+hello(2) + 世界(2)
  });

  it("Markdown 语法符号不计入字数", () => {
    const a = calcStats("# 标题\n**加粗**");
    const b = calcStats("标题加粗");
    expect(a.wordCount).toBe(b.wordCount);
  });

  it("stripMarkdownSyntax 剔除图片保留链接文本", () => {
    const text = stripMarkdownSyntax("![alt](https://a.com/x.png) [显示](https://b.com)");
    expect(text).not.toContain("alt");
    expect(text).toContain("显示");
  });
});

describe("Slug 生成（Gate 3.2）", () => {
  it("英文标题小写化 + 连字符", () => {
    expect(slugify("Hello World Post")).toBe("hello-world-post");
  });

  it("中文标题回退为 post-<时间戳36>", () => {
    const s = slugify("我的第一篇博客", 1750000000000);
    expect(s).toMatch(/^post-[a-z0-9]+$/);
    expect(isValidSlug(s)).toBe(true);
  });

  it("中英混排保留英文部分", () => {
    expect(slugify("React 学习笔记")).toBe("react");
  });

  it("符号标题回退", () => {
    expect(slugify("！！！？？？", 0)).toBe(`post-${(0).toString(36)}`);
  });

  it("校验正则：仅允许小写字母、数字与连字符且 3–80 位", () => {
    expect(isValidSlug("abc-123")).toBe(true);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("ABC")).toBe(false);
    expect(isValidSlug("a".repeat(81))).toBe(false);
    expect(isValidSlug("a_b")).toBe(false);
  });
});
