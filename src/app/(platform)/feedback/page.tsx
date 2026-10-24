import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { ModulePageHeader } from "@/components/layout/module-page-header";
import { FeedbackAdmin } from "@/modules/feedback/components/feedback-admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "需求反馈 · 个人数字工作台" };

/** 需求反馈后台（仅 ADMIN）：意见征集表随时可查 */
export default async function FeedbackAdminPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");
  if ("guest" in principal) redirect("/login");
  if (principal.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="space-y-5">
      <ModulePageHeader
        title="需求反馈"
        subtitle="用户在未开放板块提交的意见征集 · 同步归档于 feedback/意见征集.md"
      />
      <FeedbackAdmin />
    </div>
  );
}
