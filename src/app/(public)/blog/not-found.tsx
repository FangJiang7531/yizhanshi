import Link from "next/link";
import { createPostService } from "@/modules/blog/services/post.service";
import { EmptyState } from "@/components/feedback/empty-state";

/**
 * 博客区 404 边界。
 *
 * 触发场景（PRD §3.2 可见性矩阵）：slug 不存在、文章已软删除、文章未发布 /
 * 待审 / 驳回 / 已归档，以及 **PRIVATE 文章对非作者的直达访问**。
 * 注意这些场景一律返回 404 而**不是 403** —— 403 等于告诉访问者"这篇文章存在，
 * 只是你没权限"，会泄漏未公开内容的存在性（与阶段一 C-01/C-02 同样的口径）。
 *
 * 顺带给出热门标签作为出口：加载失败/链接失效是站内最常见的死路，
 * 只放一个"返回首页"会让用户离开站点。
 *
 * 注：本边界是动态渲染的（Next 对 not-found 的处理不参与 ISR 缓存），
 * 所以这里读标签云不会污染公开页的缓存策略。
 */
export const dynamic = "force-dynamic";

export default async function BlogNotFound() {
  // 兜底失败不应把 404 页也变成错误页：查不到标签就只显示基础文案
  let tags: { id: string; name: string; postCount: number }[] = [];
  try {
    tags = await createPostService().listPublicTags();
  } catch {
    tags = [];
  }

  return (
    <div className="pt-8">
      <EmptyState
        kind="generic"
        title="没有找到这篇文章"
        description="它可能已被删除、改为私密，或者链接里有笔误。"
        action={
          <Link href="/blog" className="btn btn-primary btn-sm">
            回到发现页
          </Link>
        }
      />

      <div className="mt-2 flex justify-center">
        <span className="sr-only">404 · 文章不存在</span>
      </div>

      {tags.length > 0 && (
        <section className="mx-auto max-w-[520px] border-t pt-5 text-center" style={{ borderColor: "var(--color-border)" }}>
          <h2
            className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em]"
            style={{ color: "var(--color-text-muted)" }}
          >
            换个标签看看
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {tags.slice(0, 10).map((t) => (
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
