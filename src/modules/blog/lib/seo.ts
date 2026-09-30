import type { MetadataRoute } from "next";
import type { PostDetailDTO } from "../types";

/**
 * SEO 纯函数库（PRD §5.9 / 策划文档 §6.6）。
 *
 * 全部是无副作用函数：JSON-LD 构建、OG 图地址解析、robots 规则与 sitemap 条目。
 * 抽成纯函数的原因与 lib/data-cards 相同——app/sitemap.ts、app/robots.ts、
 * 各页面只做"取数 + 调用"，规则本体集中在可单测的地方，避免散落各页漏写。
 */

/** 站点名（与根布局 title 一致；JSON-LD / RSS 共用） */
export const SITE_NAME = "个人数字工作台";

// ---------- JSON-LD ----------

/**
 * 内联 JSON-LD 的安全序列化：`</script>` 注入是结构化数据最常见的 XSS 通道，
 * JSON.stringify 不转义 `</`，必须手动替换为 Unicode 转义。
 */
export function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

export type JsonLdBlogPostingInput = {
  post: Pick<
    PostDetailDTO,
    | "title"
    | "slug"
    | "excerpt"
    | "seoDesc"
    | "publishedAt"
    | "updatedAt"
    | "wordCount"
    | "ogImage"
    | "coverImage"
    | "tags"
    | "author"
  >;
  siteUrl: string;
  siteName: string;
};

/** 文章页结构化数据：BlogPosting（PRD §5.9 要求含 wordCount/image/dateModified） */
export function buildBlogPostingJsonLd({ post, siteUrl, siteName }: JsonLdBlogPostingInput) {
  const url = `${siteUrl}/blog/p/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDesc ?? post.excerpt ?? undefined,
    image: [resolveOgImageUrl(post, siteUrl)],
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt,
    wordCount: post.wordCount,
    keywords: post.tags.map((t) => t.name).join(", ") || undefined,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: {
      "@type": "Person",
      name: post.author.displayName ?? post.author.username,
      url: `${siteUrl}/blog/u/${post.author.username}`,
    },
    publisher: { "@type": "Organization", name: siteName },
  };
}

/** 面包屑：发现页 → 文章（个人站两层足够，不做标签层级——标签页另算） */
export function buildBreadcrumbJsonLd(items: ReadonlyArray<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** 作者页结构化数据：Person（PRD §5.9：作者页用 Person） */
export function buildPersonJsonLd(
  author: { username: string; displayName: string | null; bio: string | null },
  siteUrl: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.displayName ?? author.username,
    alternateName: author.username,
    url: `${siteUrl}/blog/u/${author.username}`,
    description: author.bio ?? undefined,
  };
}

// ---------- OG 图 ----------

/**
 * OG 图三级回退（PRD §5.9）：ogImage → coverImage → 动态生成。
 * 动态图路由挂在文章路径下的 /og，与文章共享 slug 语义。
 */
export function resolveOgImageUrl(
  post: { slug: string; ogImage: string | null; coverImage: string | null },
  siteUrl: string,
): string {
  return post.ogImage ?? post.coverImage ?? `${siteUrl}/blog/p/${post.slug}/og`;
}

// ---------- robots ----------

/**
 * 站点 robots 规则（PRD §5.9）。
 * 允许公开内容；禁止创作与审核入口、API、凭 token 的草稿预览。
 *
 * 注意文章编辑页规则用了通配符星号（"blog 斜杠星号斜杠 edit"）——robots.txt
 * 的星号语义由各爬虫自行支持（Google/Bing 均支持），这是表达"所有文章的
 * 编辑页"的标准写法。⚠️ 本注释不能直接写出该路径字面量：其中包含"星号斜杠"，
 * 会提前终止本块注释（M8 踩过的坑，tsc 会在下一行报出错位的语法错误）。
 */
export function buildRobotsRules(siteUrl: string): MetadataRoute.Robots {
  return {
    rules: [
      {
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
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

// ---------- sitemap ----------

export type SitemapEntriesInput = {
  posts: ReadonlyArray<{ slug: string; updatedAt: string }>;
  authors: ReadonlyArray<{ username: string }>;
  tags: ReadonlyArray<{ name: string }>;
  siteUrl: string;
};

/**
 * sitemap 条目（PRD §5.9：仅含 PUBLIC 文章 + 作者页 + 标签页）。
 *
 * 公开性由调用方（仓储查询）保证，这里只做映射。lastModified 用文章的
 * updatedAt（含互动计数之外的实质内容变更时间）。
 *
 * UNLISTED 的边界（策划文档 §6.6 注）：不出现在列表/聚合位——sitemap 属于
 * 聚合位，因此 UNLISTED 不进 sitemap；但它不加 noindex（直达可访问）。
 */
export function buildSitemapEntries({
  posts,
  authors,
  tags,
  siteUrl,
}: SitemapEntriesInput): MetadataRoute.Sitemap {
  const nowIso = new Date().toISOString();

  const staticPages = [
    { url: `${siteUrl}/blog`, lastModified: nowIso, changeFrequency: "daily" as const, priority: 1 },
    { url: `${siteUrl}/blog/tags`, lastModified: nowIso, changeFrequency: "weekly" as const, priority: 0.6 },
  ];

  const postEntries = posts.map((p) => ({
    url: `${siteUrl}/blog/p/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const authorEntries = authors.map((a) => ({
    url: `${siteUrl}/blog/u/${a.username}`,
    lastModified: nowIso,
    changeFrequency: "daily" as const,
    priority: 0.5,
  }));

  const tagEntries = tags.map((t) => ({
    url: `${siteUrl}/blog/tags/${encodeURIComponent(t.name)}`,
    lastModified: nowIso,
    changeFrequency: "weekly" as const,
    priority: 0.4,
  }));

  return [...staticPages, ...postEntries, ...authorEntries, ...tagEntries];
}
