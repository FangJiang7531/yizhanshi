import { AdminMessages } from "@/modules/admin/components/admin-messages";

/** 系统私信：单发 + 全员广播 */
export default function AdminMessagesPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">系统私信</h1>
        <p className="mt-1 text-xs" style={{ color: "#8a92b8" }}>以官方身份发送 · 用户在私信页「系统信息」栏接收</p>
      </header>
      <AdminMessages />
    </div>
  );
}
