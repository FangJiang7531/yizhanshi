import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { ModulePageHeader } from "@/components/layout/module-page-header";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { BookmarksBoard } from "@/modules/bookmarks/components/bookmarks-board";

export const dynamic = "force-dynamic";

export const metadata = { title: "书签 · 个人数字工作台" };

/** 书签板块主页：收藏夹/标签/搜索/星标 + 站内文章收藏（受管理端功能开关控制） */
export default async function BookmarksPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");

  const feature = await isFeatureEnabled("bookmarks");
  if (!feature.enabled) {
    return (
      <div className="space-y-5">
        <ModulePageHeader title="书签" subtitle="收藏网站与文章、收藏夹分组、标签整理与全文搜索" />
        <div className="card p-10 text-center">
          <p className="text-base font-semibold">「书签」功能维护中</p>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
            {feature.disabledReason ?? "管理员已临时停用该功能，请稍后再来。"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ModulePageHeader
        title="书签"
        subtitle="收藏网站与文章、收藏夹分组、标签整理与全文搜索"
      />
      {"guest" in principal ? (
        <div className="card p-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
          访客模式下书签不可用，注册账号即可开始收藏。
        </div>
      ) : (
        <BookmarksBoard />
      )}
    </div>
  );
}
