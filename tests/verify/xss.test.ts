import { describe, it, expect } from "vitest";
import { renderMarkdown, renderCommentMarkdown } from "@/modules/blog/lib/markdown";

/** 判据：输出中不得存在"可执行"的标签 / 属性 / 协议（扫描未被转义的原始 < >） */
function assertInert(html: string) {
  expect(/<\s*(script|iframe|svg|object|embed|form|math|style|body|details)\b/i.test(html)).toBe(false);
  // 未被转义的真实标签属性：<tag ... onXxx=
  expect(/<[a-z][^>]*\son[a-z]+\s*=/i.test(html)).toBe(false);
  expect(/<[a-z][^>]*?(href|src)\s*=\s*["']?\s*(javascript|vbscript|data):/i.test(html)).toBe(false);
}

describe("安全边界 · XSS 净化核验（全部恶意输入转为惰性文本）", () => {
  const payloads = [
    "<script>alert(1)</script>",
    '<img src=x onerror="alert(1)">',
    "<svg onload=alert(1)>",
    '<a href="javascript:alert(1)">x</a>',
    "<iframe src=//evil></iframe>",
    "<details open ontoggle=alert(1)>",
    "<body onload=alert(1)>",
    "![x](javascript:alert(1))",
    "[x](data:text/html,<b>hi</b>)",
    '<math><mtext><mglyph><style><!--</style><img src onerror=alert(1)>',
  ];
  for (const p of payloads) {
    it("惰性化：" + p.slice(0, 38), async () => {
      const { html } = await renderMarkdown(p);
      assertInert(html);
      // 原始 < 必须已被转义
      expect(html).not.toContain("<" + p.replace(/^</, "").slice(0, 5));
    });
  }

  it("评论渲染同样惰性化", async () => {
    const html = await renderCommentMarkdown('<script>alert(1)</script> [x](javascript:alert(1))');
    assertInert(html);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<h1");
  });

  it("正常 Markdown 功能未被误伤", async () => {
    const { html } = await renderMarkdown("**粗体** 与 `代码` 与 [链](https://example.com)");
    expect(html).toContain("<strong>粗体</strong>");
    expect(html).toContain("<code>代码</code>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("外链自动加 target=_blank 与 noopener", async () => {
    const { html } = await renderMarkdown("[外站](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
  });
});
