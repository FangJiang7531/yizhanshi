import type { Metadata } from "next";
import Link from "next/link";
import { createPostService } from "@/modules/blog/services/post.service";
import { PostList } from "@/modules/blog/components/post-card";
import { LoadMorePosts } from "@/modules/blog/components/load-more-posts";
import { EmptyState } from "@/components/feedback/empty-state";
import { truncate } from "@/modules/blog/lib/format";
import { env } from "@/config/env";

/**
 * 标签归档 `/blog/tags/[tag]`（PRD §3.1：ISR 3600s；Gate 5.4 判据 2：每页 20 条）。
 *
 * 分页实现为"首屏静态 20 条 + 客户端加载更多"而不是 `?page=2`：
 * 读取 searchParams 会把本页拉回动态渲染，ISR 立即失效（见 public.actions.ts）。
 */
export const revalidate = 3600;
export const dynamicParams = true;

const TAKE = 20;
const postService = createPostService();

export async function generateStaticParams() {
  const tags = await postService.listTagStaticParams();
  return tags.map((t) => ({ tag: t.tag }));
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const name = decodeURIComponent(tag);
  return {
    title: `#${name} · 标签`,
    description: truncate(`标签「${name}」下的全部公开文章。`, 160),
    alternates: {
      canonical: `${env.APP_URL}/blog/tags/${encodeURIComponent(name)}`,
      types: { "application/rss+xml": `${env.APP_URL}/blog/rss.xml` },
    },
  };
}

export default async function TagArchivePage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const name = decodeURIComponent(tag);

  const [{ items, nextCursor }, allTags] = await Promise.all([
    postService.listByTag(name, { take: TAKE }),
    postService.listPublicTags(),
  ]);

  // 标签存在性：只有出现在公开标签云里才算"已知标签"。
  // 不存在时仍渲染空状态而不是 404 —— 标签可能刚被移除，之前的链接应当给出
  // 明确的"没有内容"而不是一个错误页（对 SEO 也更友好：不会把链接判为断链）。
  const known = allTags.find((t) => t.name === name) ?? null;
  const color = known?.color ?? "var(--color-text-muted)";

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/blog/tags"
          className="text-[13px] transition-colors hover:text-[var(--color-primary)]"
          style={{ color: "var(--color-text-muted)" }}
        >
          ← 全部标签
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-[24px] font-semibold tracking-tight">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          {name}
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          {known ? `${known.postCount} 篇公开文章` : "该标签下暂无公开文章"}
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          kind="generic"
          title={`没有与「${name}」相关的文章`}
          description="换一个标签，或回到发现页浏览全部内容。"
          action={
            <Link href="/blog" className="btn btn-outline btn-sm">
              回到发现页
            </Link>
          }
        />
      ) : (
        <>
          <PostList items={items} />
          <LoadMorePosts scope="tag" tag={name} initialCursor={nextCursor} />
        </>
      )}

      {allTags.length > 0 && (
        <section className="border-t pt-5" style={{ borderColor: "var(--color-border)" }}>
          <h2
            className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em]"
            style={{ color: "var(--color-text-muted)" }}
          >
            其他标签
          </h2>
          <div className="flex flex-wrap gap-2">
            {allTags
              .filter((t) => t.name !== name)
              .slice(0, 20)
              .map((t) => (
                <Link
                  key={t.id}
                  href={`/blog/tags/${encodeURIComponent(t.name)}`}
                  className="chip transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  {t.name}
                </Link>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
