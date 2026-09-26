import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { ModulePageHeader } from "@/components/layout/module-page-header";
import { createTaskService } from "@/modules/tasks/services/task-service";
import { TaskBoard } from "@/modules/tasks/components/task-board";
import { toLocalDateString } from "@/lib/date/timezone";

export const dynamic = "force-dynamic";

/** 任务清单页（RSC 初取数据，客户端接管道交互/乐观更新） */
export default async function TasksPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");

  const isGuest = "guest" in principal;
  const timezone = isGuest ? "Asia/Shanghai" : principal.user.timezone;
  const userId = isGuest ? null : principal.user.id;

  const service = createTaskService();
  const [{ items }, tags] = await Promise.all([
    service.listTasks({ principal: { userId, isGuest }, timezone, filter: "all", pageSize: 200 }),
    service.listTags({ userId, isGuest }),
  ]);

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="任务清单"
        subtitle={isGuest ? "访客模式下展示演示数据，写操作不可用" : "共 " + items.length + " 个任务"}
      />
      <TaskBoard
        initialTasks={items}
        initialTags={tags}
        today={toLocalDateString(new Date(), timezone)}
        timezone={timezone}
        isGuest={isGuest}
      />
    </div>
  );
}
