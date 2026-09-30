import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { ModerationQueue } from "@/modules/blog/components/manage/moderation-queue";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "内容审核队列 · 个人数字工作台", robots: { index: false, follow: false } };

/**
 * 审核队列 `/blog/moderation`（M10 / PRD §六：人工复核入口，ADMIN 专属）。
 *
 * 双层防线：middleware 已对 /blog/moderation 强制登录（不在公开表），
 * 这里第二层 requireRole("ADMIN")——非管理员一律 404（不泄漏"存在但无权"）。
 * 队列数据由客户端组件经 listModerationQueueAction 拉取，保证看到的是实时状态。
 */
export default async function BlogModerationPage() {
  try {
    await requireRole("ADMIN");
  } catch {
    notFound();
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="flex items-center gap-2 text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          <ShieldCheck size={20} aria-hidden style={{ color: "var(--color-primary)" }} />
          内容审核队列
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          机器审核判定「需人工复核」的文章与评论。通过后立即公开；驳回后作者可修改重新提交。
        </p>
      </header>

      <ModerationQueue />
    </div>
  );
}
