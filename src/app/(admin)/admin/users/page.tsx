import { createAdminService } from "@/modules/admin/services/admin.service";
import { AdminUsersTable } from "@/modules/admin/components/admin-users-table";

/** 用户管理：搜索 + 状态筛选 + 用户行（进详情/快捷封禁） */
export default async function AdminUsersPage() {
  const users = await createAdminService().listUsers({ status: "ALL" });
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">用户管理</h1>
        <p className="mt-1 text-xs" style={{ color: "#8a92b8" }}>查看全部用户状态 · 封禁/解封 · 称号认证 · 系统私信</p>
      </header>
      <AdminUsersTable initialUsers={users} />
    </div>
  );
}
