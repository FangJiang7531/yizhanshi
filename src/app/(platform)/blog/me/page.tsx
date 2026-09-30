import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { createPostService } from "@/modules/blog/services/post.service";
import { MyPosts } from "@/modules/blog/components/manage/my-posts";

export const dynamic = "force-dynamic";

export const metadata = { title: "我的文章 · 个人数字工作台" };

/**
 * 我的文章管理（PRD §5.1，权限：登录用户）。
 * RSC 取页头统计与首屏草稿列表；交互（页签/搜索/排序/操作）由 MyPosts 客户端接管。
 */
export default async function BlogMePage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");
  if ("guest" in principal) redirect("/login");

  const service = createPostService();
  const [stats, mine] = await Promise.all([
    service.mineStats(principal.user.id),
    service.listMine(principal.user.id, { status: "DRAFT", sort: "updated", take: 20 }),
  ]);

  const statCells: { label: string; value: number }[] = [
    { label: "草稿", value: stats.draft },
    { label: "待审", value: stats.review },
    { label: "已发布", value: stats.published },
    { label: "总阅读", value: stats.totalViews },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
            我的文章
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
            {statCells.map((cell) => (
              <span key={cell.label} className="flex items-baseline gap-1">
                {cell.label}
                <b className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                  {cell.value.toLocaleString("zh-CN")}
                </b>
              </span>
            ))}
          </div>
        </div>
        <Link href="/blog/new" className="btn btn-primary gap-1.5 text-sm">
          <Plus size={15} />
          写文章
        </Link>
      </header>

      <MyPosts initialItems={mine.items} initialCursor={mine.nextCursor} initialTab="DRAFT" />
    </div>
  );
}
