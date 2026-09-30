import type { Metadata } from "next";
import Link from "next/link";
import { createPostService } from "@/modules/blog/services/post.service";
import { EmptyState } from "@/components/feedback/empty-state";

/**
 * 标签总览 `/blog/tags`（PRD §3.1：ISR 3600s）。
 *
 * Gate 5.4 判据 3 的关键点：**任务标签不能出现在这里**。
 * 隔离由仓储 `listPublicTags()` 的 `scope: "POST"` 过滤保证（Tag 表加了域字段）——
 * 页面不做二次筛选，避免"两个地方各过滤一次、其中一处漏掉"的经典失效模式。
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "标签 · 博客",
  description: "按标签浏览博客文章。",
  alternates: { canonical: "/blog/tags" },
};

export default async function TagIndexPage() {
  const tags = await createPostService().listPublicTags();
  const total = tags.reduce((sum, t) => sum + t.postCount, 0);
  const max = tags.reduce((m, t) => Math.max(m, t.postCount), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[24px] font-semibold tracking-tight">标签</h1>
        <p className="mt-1.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          {tags.length > 0
            ? `${tags.length} 个标签，累计 ${total} 次引用。字号越大表示文章越多。`
            : "还没有文章使用标签。"}
        </p>
      </header>

      {tags.length === 0 ? (
        <EmptyState kind="generic" title="暂无标签" description="发布带标签的文章后，标签会聚合到这里。" />
      ) : (
        <ul className="flex flex-wrap items-baseline gap-x-4 gap-y-3">
          {tags.map((tag) => {
            // 字号按引用次数在 14–26px 之间线性插值（最少 0 篇的标签不会出现，故 max ≥ 1）
            const scale = max > 0 ? 14 + (tag.postCount / max) * 12 : 14;
            return (
              <li key={tag.id}>
                <Link
                  href={`/blog/tags/${encodeURIComponent(tag.name)}`}
                  className="inline-flex items-baseline gap-1.5 transition-colors hover:text-[var(--color-primary)]"
                  style={{ fontSize: Math.round(scale), color: "var(--color-text-primary)" }}
                >
                  <span
                    aria-hidden
                    className="inline-block shrink-0 self-center rounded-full"
                    style={{ width: 7, height: 7, backgroundColor: tag.color }}
                  />
                  <span className="font-medium">{tag.name}</span>
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {tag.postCount}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
