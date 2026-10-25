import { createAdminService } from "@/modules/admin/services/admin.service";
import { AdminModeration } from "@/modules/admin/components/admin-moderation";

/** 内容审核：待审文章/评论 + 违禁词阻断记录 */
export default async function AdminModerationPage() {
  const service = createAdminService();
  const [blocked] = await Promise.all([service.listBlocked("pending")]);
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">内容审核</h1>
        <p className="mt-1 text-xs" style={{ color: "#8a92b8" }}>自动审查（违禁词引擎）拦下的内容与待审队列统一处置</p>
      </header>
      <AdminModeration initialBlocked={blocked} />
    </div>
  );
}
