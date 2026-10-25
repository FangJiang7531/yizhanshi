import { createAdminService } from "@/modules/admin/services/admin.service";
import { AdminAnnouncements } from "@/modules/admin/components/admin-announcements";

/** 公告管理：弹窗公告 CRUD 与启停 */
export default async function AdminAnnouncementsPage() {
  const list = await createAdminService().listAnnouncements();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">公告管理</h1>
        <p className="mt-1 text-xs" style={{ color: "#8a92b8" }}>生效公告将在用户进入平台时弹窗展示（每用户每条仅首次弹出）</p>
      </header>
      <AdminAnnouncements
        initial={list.map((a) => ({
          ...a,
          level: (["info", "warning", "critical"] as const).includes(a.level as "info")
            ? (a.level as "info" | "warning" | "critical")
            : "info",
        }))}
      />
    </div>
  );
}
