import type { Metadata } from "next";
import Link from "next/link";
import { Flame, Sparkles, PenLine, Search } from "lucide-react";
import { createPostService } from "@/modules/blog/services/post.service";
import { PostList } from "@/modules/blog/components/post-card";
import { LoadMorePosts } from "@/modules/blog/components/load-more-posts";
import { EmptyState } from "@/components/feedback/empty-state";
import type { PublicListQuery } from "@/modules/blog/types";

/**
 * 发现页 `/blog`（制作流程 Step 5.1）。
 *
 * 渲染策略：`force-dynamic`（PRD §3.1）。理由与详情页相反——本页含"热门"排序与
 * 标签云聚合，两者都随互动数据实时变化，缓存 1 小时会让热门榜明显滞后；
 * 而它本身没有昂贵的渲染成本（列表项不含正文 HTML），动态渲染是最划算的选择。
 *
 * 未登录可访问（middleware 放行 + 本页不读 Session），因此这里**不能**渲染任何
 * 身份相关内容——顶部导航里的"我的文章/写文章"由客户端组件自行查询登录态。
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "博客 · 发现",
  description: "浏览最新与最热的技术与生活记录，支持标签筛选与全文搜索。",
  alternates: { canonical: "/blog" },
};

const TAKE = 12;

const TABS = [
  { key: "latest", label: "最新", icon: Sparkles },
  { key: "hot", label: "热门", icon: Flame },
] as const;

export default async function BlogDiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab: PublicListQuery["tab"] = params.tab === "hot" ? "hot" : "latest";

  const service = createPostService();
  const [{ items, nextCursor }, tags] = await Promise.all([
    service.listPublic({ tab, take: TAKE }),
    service.listPublicTags(),
  ]);

  return (
    <div className="space-y-6">
      <section className="pt-1">
        <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">博客</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          记录想法、复盘与踩坑笔记。
          {tags.length > 0 && <>目前已用到 {tags.length} 个标签。</>}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href="/blog/search" className="btn btn-outline btn-sm">
            <Search size={14} aria-hidden />
            搜索文章
          </Link>
          <Link href="/blog/tags" className="btn btn-ghost btn-sm">
            全部标签 →
          </Link>
        </div>
      </section>

      <nav aria-label="文章排序" className="flex items-center gap-1 border-b pb-0" style={{ borderColor: "var(--color-border)" }}>
        {TABS.map((t) => {
          const active = t.key === tab;
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              href={t.key === "latest" ? "/blog" : `/blog?tab=${t.key}`}
              aria-current={active ? "page" : undefined}
              className="relative -mb-px flex items-center gap-1.5 px-3 py-2 text-sm transition-colors"
              style={{
                color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
                fontWeight: active ? 600 : 400,
                borderBottom: active ? "2px solid var(--color-primary)" : "2px solid transparent",
              }}
            >
              <Icon size={15} aria-hidden />
              {t.label}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          kind="generic"
          title={tab === "hot" ? "还没有热度数据" : "还没有已发布的文章"}
          description={
            tab === "hot"
              ? "点赞与浏览累积后，热门榜会自动出现内容。"
              : "发布第一篇文章后，它会出现在这里。"
          }
          action={
            <Link href="/blog/new" className="btn btn-primary btn-sm">
              <PenLine size={14} aria-hidden />
              写第一篇
            </Link>
          }
        />
      ) : (
        <>
          <PostList items={items} />
          <LoadMorePosts scope="all" tab={tab} initialCursor={nextCursor} />
        </>
      )}

      {tags.length > 0 && (
        <section className="border-t pt-5" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: "var(--color-text-muted)" }}>
            标签云
          </h2>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/blog/tags/${encodeURIComponent(tag.name)}`}
                className="chip transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                <span
                  aria-hidden
                  className="inline-block shrink-0 rounded-full"
                  style={{ width: 6, height: 6, backgroundColor: tag.color }}
                />
                {tag.name}
                <span style={{ color: "var(--color-text-muted)" }}>{tag.postCount}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
