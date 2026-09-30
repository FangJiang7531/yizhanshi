import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArrowLeft, ArrowRight, Clock, Eye } from "lucide-react";
import { createPostService } from "@/modules/blog/services/post.service";
import { PostNotAccessibleError } from "@/lib/errors";
import { ReadingProgress } from "@/modules/blog/components/reading-progress";
import { TableOfContents } from "@/modules/blog/components/table-of-contents";
import { PostEnhancer } from "@/modules/blog/components/post-enhancer";
import { AuthorAvatar } from "@/modules/blog/components/post-card";
import { TagRow } from "@/modules/blog/components/tag-chip";
import { formatDate, formatReadingTime, isoDateOnly, truncate } from "@/modules/blog/lib/format";
import { buildBlogPostingJsonLd, buildBreadcrumbJsonLd, resolveOgImageUrl, safeJsonLd, SITE_NAME } from "@/modules/blog/lib/seo";
import { env } from "@/config/env";
import type { PostDetailDTO } from "@/modules/blog/types";

/**
 * 文章详情页 `/blog/p/[slug]`（制作流程 Step 5.2 —— 本阶段最高风险点）。
 *
 * ━━ 铁律：本页面链路（含其布局）绝不能读取 Session / Cookie ━━
 *
 * 原因有二，任一都足以否决"服务端读登录态"的做法：
 * 1. **ISR 会失效**。读 Cookie 属动态 API，Next 会把整条路由拉回动态渲染，
 *    `revalidate = 3600` 形同虚设；
 * 2. **更严重的是缓存串用户**。若把"已点赞 / 作者操作按钮"渲染进服务端输出，
 *    缓存命中时用户 A 的登录态会被回放给访客 B（Gate 5.2 判据 1、2）。
 *
 * 因此这里一律以 `viewer: { userId: null }` 取**纯公开视角**；登录态相关的
 * 互动栏、评论区由客户端组件在挂载后自行获取（M9/M10 落地）。
 * 作者查看自己的非公开文章走 `/blog/preview/[token]`，不走本路由。
 */

/** ISR：1 小时（PRD §3.1）。发布/归档/改 slug 时由 Action 层 revalidatePath 主动失效。 */
export const revalidate = 3600;

/** 未列入预渲染的 slug 也允许按需生成并缓存（PRD 要求 dynamicParams: true） */
export const dynamicParams = true;

const postService = createPostService();

/**
 * 请求级缓存的文章读取：`generateMetadata` 与页面正文共用同一次查询。
 * 不用 `unstable_cache`，因为 ISR 已经在路由层做了持久缓存，这里只需去重。
 */
const loadPost = cache(async (slug: string): Promise<PostDetailDTO | null> => {
  try {
    const res = await postService.getBySlug(slug, { userId: null });
    return res.post;
  } catch (err) {
    // 只有"不可访问"才降级为 404；数据库故障等异常必须抛出，
    // 否则会把真实故障缓存成一篇"文章不存在"，问题被静默掩盖。
    if (err instanceof PostNotAccessibleError) return null;
    throw err;
  }
});

/**
 * 预渲染候选集：最近 100 篇 + 热门 50 篇（去重）。
 * 不预渲染全部文章——构建时间会随文章数线性增长；其余文章首次访问时按需生成并写入缓存。
 */
export async function generateStaticParams() {
  const posts = await postService.listStaticParams();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return { title: "文章不存在", robots: { index: false, follow: false } };

  const url = `${env.APP_URL}/blog/p/${post.slug}`;
  const description = post.seoDesc ?? post.excerpt ?? truncate(post.title, 160);
  // OG 图三级回退（PRD §5.9）：ogImage → coverImage → 动态生成路由
  const image = resolveOgImageUrl(post, env.APP_URL);

  return {
    title: `${truncate(post.seoTitle ?? post.title, 60)} · ${post.author.displayName ?? post.author.username}`,
    description,
    alternates: {
      canonical: post.canonicalUrl ?? url,
      // RSS 自动发现（PRD §5.8：<head> 注入 <link rel="alternate">）
      types: { "application/rss+xml": `${env.APP_URL}/blog/rss.xml` },
    },
    openGraph: {
      type: "article",
      title: post.seoTitle ?? post.title,
      description,
      url,
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      authors: [post.author.displayName ?? post.author.username],
      tags: post.tags.map((t) => t.name),
      images: [image],
    },
    twitter: { card: "summary_large_image", images: [image] },
    // 可见性矩阵（PRD §3.2）：PRIVATE 必须 noindex,nofollow；UNLISTED 不加 noindex
    ...(post.visibility === "PRIVATE"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}

export default async function PostDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) notFound();

  const [related, adjacent] = await Promise.all([
    postService.listRelated(
      post.id,
      post.tags.map((t) => t.id),
    ),
    postService.getAdjacent(post),
  ]);

  return (
    <article className="blog-rise">
      <ReadingProgress targetId="post-body" />

      <div className="flex justify-center gap-8">
        <div className="min-w-0 max-w-[720px] flex-1">
          <header>
            <Link
              href="/blog"
              className="inline-flex items-center gap-1 text-[13px] transition-colors hover:text-[var(--color-primary)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <ArrowLeft size={13} aria-hidden />
              返回发现页
            </Link>

            <h1
              className="mt-3 text-[clamp(26px,4.6vw,38px)] font-bold leading-[1.3]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {post.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
              <AuthorAvatar author={post.author} size={28} />
              <time dateTime={isoDateOnly(post.publishedAt)} style={{ color: "var(--color-text-muted)" }}>
                {formatDate(post.publishedAt)}
              </time>
              <span className="inline-flex items-center gap-1" style={{ color: "var(--color-text-muted)" }}>
                <Clock size={13} aria-hidden />
                {formatReadingTime(post.readingMinutes)}
              </span>
              <span className="inline-flex items-center gap-1" style={{ color: "var(--color-text-muted)" }}>
                <Eye size={13} aria-hidden />
                {post.viewCount}
              </span>
            </div>

            {post.tags.length > 0 && (
              <div className="mt-3">
                <TagRow tags={post.tags} />
              </div>
            )}

            {post.coverImage && (
              // eslint-disable-next-line @next/next/no-img-element -- 上传图走本地 API 路由且已转 WebP
              <img
                src={post.coverImage}
                alt={post.title}
                className="mt-5 w-full rounded-[var(--radius-lg)] object-cover"
                style={{ aspectRatio: "16 / 9" }}
              />
            )}
          </header>

          {/* 移动端目录折叠在正文之前 */}
          <div className="mt-6 lg:hidden">
            <TableOfContents items={post.toc} />
          </div>

          <div
            id="post-body"
            className="blog-prose mt-7"
            dangerouslySetInnerHTML={{ __html: post.contentHtml }}
          />
          <PostEnhancer targetId="post-body" />

          <footer className="mt-10 border-t pt-6" style={{ borderColor: "var(--color-border)" }}>
            {post.tags.length > 0 && (
              <div className="mb-5">
                <TagRow tags={post.tags} />
              </div>
            )}

            <nav aria-label="上一篇与下一篇" className="grid gap-3 sm:grid-cols-2">
              <AdjacentLink direction="prev" item={adjacent.prev} />
              <AdjacentLink direction="next" item={adjacent.next} />
            </nav>
          </footer>

          {related.length > 0 && (
            <section className="mt-10 border-t pt-6" style={{ borderColor: "var(--color-border)" }}>
              <h2
                className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em]"
                style={{ color: "var(--color-text-muted)" }}
              >
                相关文章
              </h2>
              <ul>
                {related.map((item) => (
                  <li key={item.id} className="border-b py-3 last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                    <Link
                      href={`/blog/p/${item.slug}`}
                      className="text-[15px] font-medium transition-colors hover:text-[var(--color-primary)]"
                    >
                      {item.title}
                    </Link>
                    <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {formatDate(item.publishedAt)} · {formatReadingTime(item.readingMinutes)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* 桌面端右侧悬浮目录 */}
        <TableOfContents items={post.toc} />
      </div>

      {/* 结构化数据（PRD §5.9）：BlogPosting + BreadcrumbList。
          safeJsonLd 已做 </script> 注入防护；内容不含任何用户态，随 ISR 缓存安全。 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(buildBlogPostingJsonLd({ post, siteUrl: env.APP_URL, siteName: SITE_NAME })),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(
            buildBreadcrumbJsonLd([
              { name: "博客", url: `${env.APP_URL}/blog` },
              { name: post.title, url: `${env.APP_URL}/blog/p/${post.slug}` },
            ]),
          ),
        }}
      />
    </article>
  );
}

function AdjacentLink({
  direction,
  item,
}: {
  direction: "prev" | "next";
  item: { slug: string; title: string } | null;
}) {
  if (!item) return <span />;
  const isPrev = direction === "prev";
  return (
    <Link
      href={`/blog/p/${item.slug}`}
      className="group flex flex-col gap-1 rounded-[var(--radius)] border px-4 py-3 transition-colors hover:border-[var(--color-primary)]"
      style={{ borderColor: "var(--color-border)", alignItems: isPrev ? "flex-start" : "flex-end", textAlign: isPrev ? "left" : "right" }}
    >
      <span
        className="inline-flex items-center gap-1 text-[11px]"
        style={{ color: "var(--color-text-muted)" }}
      >
        {isPrev && <ArrowLeft size={11} aria-hidden />}
        {isPrev ? "上一篇" : "下一篇"}
        {!isPrev && <ArrowRight size={11} aria-hidden />}
      </span>
      <span className="line-clamp-2 text-[13px] font-medium transition-colors group-hover:text-[var(--color-primary)]">
        {item.title}
      </span>
    </Link>
  );
}
