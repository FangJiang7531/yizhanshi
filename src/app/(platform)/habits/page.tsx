import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { ModulePageHeader } from "@/components/layout/module-page-header";
import { createHabitService } from "@/modules/habits/services/habit-service";
import { HabitBoard } from "@/modules/habits/components/habit-board";
import { toLocalDateString } from "@/lib/date/timezone";

export const dynamic = "force-dynamic";

/** 习惯打卡页 */
export default async function HabitsPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");

  const isGuest = "guest" in principal;
  const timezone = isGuest ? "Asia/Shanghai" : principal.user.timezone;
  const userId = isGuest ? null : principal.user.id;
  const today = toLocalDateString(new Date(), timezone);

  const service = createHabitService();
  const habits = await service.listHabits({ principal: { userId, isGuest }, today });

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="习惯打卡"
        subtitle={isGuest ? "访客模式下展示演示数据，写操作不可用" : "坚持的每一天都在这里"}
      />
      <HabitBoard initialHabits={habits} today={today} isGuest={isGuest} />
    </div>
  );
}
