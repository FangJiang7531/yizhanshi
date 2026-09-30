import type { Metadata } from "next";
import { Search } from "lucide-react";
import { createSearchService } from "@/modules/blog/services/search.service";
import { SearchView } from "@/modules/blog/components/search-view";
import { getPrincipal } from "@/lib/auth/session";
import { env } from "@/config/env";

/**
 * 搜索页 `/blog/search`（PRD §3.1：SSR force-dynamic / §5.7）。
 *
 * 渲染策略与发现页相同：结果实时性优先，动态渲染最划算。
 * 首屏结果直接 SSR（?q= 直链可分享、爬虫与无 JS 环境也有完整结果），
 * 后续输入由客户端 SearchView 接管（防抖 + 游标分页）。
 *
 * 关于登录态：本页是 force-dynamic（无缓存），读 session 不存在
 * "缓存串用户"问题——这与 ISR 页面的铁律不同，但仍然只把结果用于
 * 空状态引导按钮（canWrite），不渲染任何身份内容进正文。
 *
 * noindex：搜索结果页是典型 thin content，且 ?q= 组合无穷会让爬虫
 * 无限爬取（标准 SEO 实践；PRD sitemap 也不含本页）。
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  return {
    title: query ? `搜索：${query}` : "搜索文章",
    description: "按标题、摘要、正文与标签全文检索公开文章。",
    robots: { index: false, follow: true },
    alternates: {
      canonical: query ? undefined : `${env.APP_URL}/blog/search`,
      types: { "application/rss+xml": `${env.APP_URL}/blog/rss.xml` },
    },
  };
}

export default async function BlogSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  // 触发门槛与 searchSchema 一致：≥2 字符（PRD §5.7）
  const valid = query.length >= 2 && query.length <= 100;

  const searchService = createSearchService();
  const [result, popularTags, principal] = await Promise.all([
    valid ? searchService.search(query, { take: 20 }) : Promise.resolve(null),
    searchService.popularTags(8),
    getPrincipal(),
  ]);

  return (
    <div className="space-y-6">
      <section className="pt-1">
        <h1 className="flex items-center gap-2 text-[26px] font-semibold tracking-tight sm:text-[30px]">
          <Search size={24} aria-hidden style={{ color: "var(--color-primary)" }} />
          搜索文章
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          支持标题、摘要、正文与标签的全文检索，中文友好。
        </p>
      </section>

      <SearchView
        initialQ={query}
        initialResult={result}
        initialPopularTags={popularTags}
        canWrite={principal !== null && "user" in principal}
      />
    </div>
  );
}
