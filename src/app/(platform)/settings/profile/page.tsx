import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { ModulePageHeader } from "@/components/layout/module-page-header";
import { ProfileForm } from "@/modules/auth/components/profile-form";

export const dynamic = "force-dynamic";

/** 个人资料编辑页（PRD §7.7 个人资料分区的完整实现） */
export default async function ProfilePage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");
  if ("guest" in principal) redirect("/settings");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ModulePageHeader title="个人资料" subtitle="这里的昵称与头像会展示在顶栏与评论中" />
      <div className="card p-6">
        <ProfileForm
          displayName={principal.user.displayName ?? principal.user.username}
          username={principal.user.username}
          email={principal.user.email}
          avatarUrl={principal.user.avatarUrl}
          timezone={principal.user.timezone}
        />
      </div>
    </div>
  );
}
