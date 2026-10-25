import { MODULES } from "@/config/modules";
import { createAdminService } from "@/modules/admin/services/admin.service";
import { AdminFeatures } from "@/modules/admin/components/admin-features";

/** 功能开关：管理端一键启停用户端板块 */
export default async function AdminFeaturesPage() {
  const flags = await createAdminService().listFlags();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">功能开关</h1>
        <p className="mt-1 text-xs" style={{ color: "#8a92b8" }}>停用后用户端对应板块立即显示维护提示，写操作同步拦截</p>
      </header>
      <AdminFeatures modules={MODULES.map((m) => ({ key: m.key, name: m.name, status: m.status }))} initialFlags={flags.map((f) => ({ key: f.key, enabled: f.enabled, disabledReason: f.disabledReason }))} />
    </div>
  );
}
