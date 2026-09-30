import { describe, expect, it } from "vitest";
import {
  buildBlogPostingJsonLd,
  buildBreadcrumbJsonLd,
  buildPersonJsonLd,
  buildRobotsRules,
  buildSitemapEntries,
  resolveOgImageUrl,
  safeJsonLd,
  SITE_NAME,
} from "@/modules/blog/lib/seo";
import { buildRssXml } from "@/modules/blog/lib/rss";
import { highlightTitle } from "@/modules/blog/services/search.service";
import type { PostDetailDTO, PostListItemDTO } from "@/modules/blog/types";

/**
 * M8 SEO / RSS 纯函数测试（PRD §5.8 / §5.9）。
 *
 * 这些函数是"被爬虫和阅读器消费"的边界输出：JSON-LD 注入是 XSS 高危通道
 * （</script> 逃逸）、robots 规则写错会静默失去 SEO 或暴露私密入口、
 * RSS XML 转义错一个 & 就整条 feed 废掉——全部值得逐项断言。
 */

// ---------- 测试夹具 ----------

function makePost(over: Partial<PostListItemDTO> = {}): PostDetailDTO {
  return {
    id: "p1",
    slug: "hello-world",
    title: "你好 & <世界>",
    excerpt: "这是一篇关于 <script> 的文章",
    coverImage: null,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    auditStatus: "PASSED",
    publishedAt: "2026-09-01T02:00:00.000Z",
    updatedAt: "2026-09-02T02:00:00.000Z",
    wordCount: 1200,
    readingMinutes: 5,
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    shareCount: 0,
    allowComment: true,
    allowRepost: true,
    tags: [{ id: "t1", name: "效率" }],
    author: { id: "u1", username: "zhang_san", displayName: "张三", avatarUrl: null },
    contentHtml: "<p>x</p>",
    toc: [],
    auditNote: null,
    seoTitle: null,
    seoDesc: null,
    ogImage: null,
    canonicalUrl: null,
    ...over,
  } as PostDetailDTO;
}

// ---------- safeJsonLd：内联脚本注入防护 ----------

describe("safeJsonLd（JSON-LD 内联注入防护）", () => {
  it("普通对象序列化保持 JSON 语义", () => {
    expect(JSON.parse(safeJsonLd({ a: 1 }))).toEqual({ a: 1 });
  });

  it("字符串中的 </script> 被转义，无法逃出 script 标签", () => {
    const out = safeJsonLd({ evil: "</script><script>alert(1)</script>" });
    // HTML 解析器终止 script 标签只认字面序列 </script——源码中 < 已变成
    // \u003c（JS 转义），解析阶段不可见，注入通道关闭；JS 执行时才还原为真字符
    expect(out).not.toContain("</script");
    expect(out).toContain("\\u003c/script>");
    // 仍可被 JSON.parse 还原
    expect(JSON.parse(out).evil).toBe("</script><script>alert(1)</script>");
  });

  it("所有左尖括号统一转义（含标签形状的正文片段）", () => {
    const out = safeJsonLd({ html: "<b>bold</b>" });
    expect(out).toContain("\\u003cb>");
    expect(out).not.toContain("<b>");
  });
});

// ---------- JSON-LD 构建器 ----------

describe("buildBlogPostingJsonLd（PRD §5.9：含 wordCount/dateModified/image）", () => {
  it("核心字段齐全且 URL 正确", () => {
    const ld = buildBlogPostingJsonLd({ post: makePost(), siteUrl: "https://x.example", siteName: SITE_NAME });
    expect(ld["@type"]).toBe("BlogPosting");
    expect(ld.headline).toBe("你好 & <世界>");
    expect(ld.wordCount).toBe(1200);
    expect(ld.datePublished).toBe("2026-09-01T02:00:00.000Z");
    expect(ld.dateModified).toBe("2026-09-02T02:00:00.000Z");
    expect(ld.url).toBe("https://x.example/blog/p/hello-world");
    expect(ld.author).toMatchObject({ "@type": "Person", name: "张三" });
    expect(ld.author.url).toBe("https://x.example/blog/u/zhang_san");
    expect(ld.keywords).toBe("效率");
  });

  it("image 走 OG 三级回退（无 ogImage/coverImage → 动态生成路由）", () => {
    const ld = buildBlogPostingJsonLd({ post: makePost(), siteUrl: "https://x.example", siteName: SITE_NAME });
    expect(ld.image).toEqual(["https://x.example/blog/p/hello-world/og"]);
  });
});

describe("buildBreadcrumbJsonLd / buildPersonJsonLd", () => {
  it("面包屑 position 从 1 开始", () => {
    const ld = buildBreadcrumbJsonLd([
      { name: "博客", url: "https://x.example/blog" },
      { name: "文章", url: "https://x.example/blog/p/a" },
    ]);
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "博客", item: "https://x.example/blog" },
      { "@type": "ListItem", position: 2, name: "文章", item: "https://x.example/blog/p/a" },
    ]);
  });

  it("Person：displayName 优先，bio 缺省时 description 为 undefined（JSON.stringify 会省略该键）", () => {
    const ld = buildPersonJsonLd({ username: "zhang_san", displayName: "张三", bio: null }, "https://x.example");
    expect(ld).toMatchObject({ "@type": "Person", name: "张三", alternateName: "zhang_san" });
    expect(ld.description).toBeUndefined();
    // 最终内联输出中不含 description 键
    expect(safeJsonLd(ld)).not.toContain("description");
  });
});

// ---------- OG 图三级回退 ----------

describe("resolveOgImageUrl（PRD §5.9：ogImage → coverImage → 动态生成）", () => {
  const siteUrl = "https://x.example";

  it("第一级：ogImage 显式配置", () => {
    expect(resolveOgImageUrl({ slug: "a", ogImage: "https://cdn.example/og.png", coverImage: null }, siteUrl)).toBe(
      "https://cdn.example/og.png",
    );
  });

  it("第二级：无 ogImage 时用 coverImage", () => {
    expect(resolveOgImageUrl({ slug: "a", ogImage: null, coverImage: "https://cdn.example/cover.png" }, siteUrl)).toBe(
      "https://cdn.example/cover.png",
    );
  });

  it("第三级：都为空 → 动态生成路由（1200×630）", () => {
    expect(resolveOgImageUrl({ slug: "a", ogImage: null, coverImage: null }, siteUrl)).toBe(
      `${siteUrl}/blog/p/a/og`,
    );
  });
});

// ---------- robots ----------

describe("buildRobotsRules（PRD §5.9 的禁爬清单逐项断言）", () => {
  it("私密/创作/API/草稿预览全部禁爬，sitemap 指向站点根", () => {
    const rules = buildRobotsRules("https://x.example");
    const rule = Array.isArray(rules.rules) ? rules.rules[0] : rules.rules;
    expect(rule).toMatchObject({
      userAgent: "*",
      allow: "/",
      disallow: [
        "/blog/me",
        "/blog/new",
        "/blog/*/edit",
        "/blog/moderation",
        "/api/",
        "/blog/preview/",
      ],
    });
    expect(rules.sitemap).toBe("https://x.example/sitemap.xml");
  });
});

// ---------- sitemap ----------

describe("buildSitemapEntries（PRD §5.9：公开文章+作者页+标签页）", () => {
  it("四类条目齐全，标签名做 URL 编码，文章 lastModified 用文章时间", () => {
    const entries = buildSitemapEntries({
      posts: [{ slug: "hello-world", updatedAt: "2026-09-02T02:00:00.000Z" }],
      authors: [{ username: "zhang_san" }],
      tags: [{ name: "效率" }, { name: "连载" }],
      siteUrl: "https://x.example",
    });

    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://x.example/blog");
    expect(urls).toContain("https://x.example/blog/tags");
    expect(urls).toContain("https://x.example/blog/p/hello-world");
    expect(urls).toContain("https://x.example/blog/u/zhang_san");
    expect(urls).toContain(`https://x.example/blog/tags/${encodeURIComponent("效率")}`);

    const postEntry = entries.find((e) => e.url === "https://x.example/blog/p/hello-world")!;
    expect(postEntry.lastModified).toBe("2026-09-02T02:00:00.000Z");
  });
});

// ---------- RSS ----------

describe("buildRssXml（PRD §5.8：RSS 2.0 + Atom 自链接）", () => {
  const channel = {
    title: "站点 · 博客",
    description: "最新文章",
    siteUrl: "https://x.example",
    feedUrl: "https://x.example/blog/rss.xml",
    siteName: "站点",
  };

  it("channel 头与 atom:link self 齐备", () => {
    const xml = buildRssXml([], channel);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<title>站点 · 博客</title>");
    expect(xml).toContain('<atom:link href="https://x.example/blog/rss.xml" rel="self"');
    expect(xml).toContain('type="application/rss+xml"');
    expect(xml).toContain("<language>zh-CN</language>");
  });

  it("item 含 GUID(=文章链接)/link/作者(带占位邮箱)/分类，发布时间格式为 RFC 822", () => {
    const post = makePost({ publishedAt: "2026-09-01T02:00:00.000Z" });
    const xml = buildRssXml([post], channel);
    expect(xml).toContain("<guid");
    expect(xml).toContain("https://x.example/blog/p/hello-world");
    // RSS 2.0 要求 author 为 "email (Name)" 格式（W3C 校验硬性检查）；
    // 占位邮箱避免暴露真实用户邮箱
    expect(xml).toContain("<author>noreply@x.example (张三)</author>");
    expect(xml).toContain("<category>效率</category>");
    // RFC 822：Tue, 01 Sep 2026 ...（feed 库负责格式化）
    expect(xml).toMatch(/<pubDate>Tue, 01 Sep 2026/);
  });

  it("标题/摘要经 CDATA 包裹：特殊字符合法且不会被解析成元素（feed@6 的转义策略）", () => {
    const xml = buildRssXml([makePost()], channel);
    // CDATA 区内 & 和 < 都合法——XML 解析器不会把 <世界> 当元素、& 不需要转义
    expect(xml).toContain("<title><![CDATA[你好 & <世界>]]></title>");
    expect(xml).toContain("<description><![CDATA[这是一篇关于 <script> 的文章]]></description>");
    // item 数量正确（说明正文里的 <script> 没有被当成结构输出）
    expect(xml.split("<item>").length - 1).toBe(1);
  });

  it("多文章按传入顺序输出（排序由调用方保证）", () => {
    const p1 = makePost({ id: "p1", slug: "a", title: "A" });
    const p2 = makePost({ id: "p2", slug: "b", title: "B" });
    const xml = buildRssXml([p1, p2], channel);
    expect(xml.indexOf("<title><![CDATA[A]]></title>")).toBeLessThan(
      xml.indexOf("<title><![CDATA[B]]></title>"),
    );
  });
});

// ---------- 搜索标题高亮 ----------

describe("highlightTitle（PRD A-14：命中标题并高亮）", () => {
  it("命中词包 <mark>，大小写不敏感", () => {
    expect(highlightTitle("Hello World 你好", "world")).toBe("Hello <mark>World</mark> 你好");
  });

  it("标题里的 HTML 特殊字符先转义再插 <mark>", () => {
    const out = highlightTitle("<b>测试</b>测试", "测试");
    expect(out).toBe("&lt;b&gt;<mark>测试</mark>&lt;/b&gt;<mark>测试</mark>");
    expect(out).not.toContain("<b>");
  });

  it("q 中的正则元字符按字面匹配（不抛异常、不改变语义）", () => {
    expect(highlightTitle("a.b (c) [d]", ".")).toBe("a<mark>.</mark>b (c) [d]");
    expect(highlightTitle("1+1=2", "1+1")).toBe("<mark>1+1</mark>=2");
  });

  it("未命中原样转义返回", () => {
    expect(highlightTitle("纯文本", "不存在")).toBe("纯文本");
  });
});
