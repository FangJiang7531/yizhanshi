import { notFound } from "next/navigation";
import { createAdminService } from "@/modules/admin/services/admin.service";
import { AdminUserPanel } from "@/modules/admin/components/admin-user-panel";

/** 用户详情：资料 / 统计 / 称号编辑 / 封禁 / 发送系统私信 */
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = createAdminService();
  const user = await service.getUserDetail(id).catch(() => null);
  if (!user) notFound();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">{user.displayName ?? user.username}</h1>
        <p className="mt-1 text-xs" style={{ color: "#8a92b8" }}>@{user.username} · {user.email}</p>
      </header>
      <AdminUserPanel user={user} />
    </div>
  );
}
