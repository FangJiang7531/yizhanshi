import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { MODULES } from "@/config/modules";
import { getDashboardData } from "@/modules/analytics/services/dashboard-service";
import { DashboardSections } from "@/modules/analytics/components/dashboard-sections";
import { StatRing } from "@/modules/analytics/components/stat-gauge";
import { toLocalDateString } from "@/lib/date/timezone";
import { Flame } from "lucide-react";

export const dynamic = "force-dynamic";

/** 总览仪表盘：问候区 + 仪表盘（环形进度）+ 今日任务/习惯 + 快捷入口 */
export default async function DashboardPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");

  const isGuest = "guest" in principal;
  const timezone = isGuest ? "Asia/Shanghai" : principal.user.timezone;
  const userId = isGuest ? null : principal.user.id;
  const today = toLocalDateString(new Date(), timezone);

  const data = await getDashboardData({ principal: { userId, isGuest }, timezone, today });
  const displayName = isGuest
    ? principal.guest.displayName
    : (principal.user.displayName ?? principal.user.username);

  // 仪表盘口径
  const taskDone = data.todayCompletedCount;
  const taskTotal = data.todayCompletedCount + data.todayPendingCount;
  const habitDone = data.habits.filter((h) => h.checkedToday).length;
  const habitTotal = data.habits.length;

  return (
    <div className="relative space-y-8">
      {/* 识别锚点（优化文档 §4.3）：左上角柔光晕，固定不随滚动 */}
      <div className="dashboard-aurora" aria-hidden />

      {/* 问候区：按用户本地时间与时区展示 */}
      <header className="relative">
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.01em]">
          {data.greeting}，{displayName}
          {isGuest ? <span className="ml-2 text-sm font-normal" style={{ color: "var(--color-text-muted)" }}>（访客模式 · 只读）</span> : null}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          {data.localDateText}
        </p>
      </header>

      {/* 仪表盘：环形进度 ×2 + 连续打卡。整卡以主色极浅渐变打底，
          与页面背景平滑过渡，避免生硬的色块分割 */}
      <section
        aria-label="今日概览"
        className="card relative overflow-hidden p-5"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-surface)) 0%, var(--color-bg-surface) 45%, color-mix(in srgb, var(--color-accent) 5%, var(--color-bg-surface)) 100%)",
        }}
      >
        <div className="flex flex-wrap items-center justify-around gap-6 sm:gap-10">
          <StatRing value={taskDone} total={taskTotal} label="今日任务" />
          <div className="hidden h-16 w-px shrink-0 sm:block" style={{ background: "linear-gradient(to bottom, transparent, var(--color-border), transparent)" }} aria-hidden />
          <StatRing value={habitDone} total={habitTotal} label="今日习惯" />
          <div className="hidden h-16 w-px shrink-0 sm:block" style={{ background: "linear-gradient(to bottom, transparent, var(--color-border), transparent)" }} aria-hidden />
          {/* 连续打卡：数字即仪表 */}
          <div className="flex min-w-[108px] flex-col items-center gap-1.5">
            <div
              className="flex h-[108px] w-[108px] flex-col items-center justify-center rounded-full"
              style={{
                background:
                  "radial-gradient(circle, color-mix(in srgb, var(--color-warning) 14%, transparent) 0%, transparent 72%)",
              }}
            >
              <span className="flex items-center gap-1 text-2xl font-semibold tabular-nums" style={{ color: "var(--color-warning)" }}>
                <Flame size={20} aria-hidden />
                {data.longestStreak}
              </span>
              <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                天连续
              </span>
            </div>
            <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
              最长连续打卡
            </span>
          </div>
        </div>
      </section>

      {/* 今日任务 / 今日习惯（可直接勾选、打卡） */}
      <DashboardSections initialTasks={data.todayTasks} habits={data.habits} today={today} isGuest={isGuest} />

      {/* 快捷入口：全部板块（图标章用板块品牌色浅底，一眼识别“这是哪个板块”） */}
      <section aria-label="快捷入口" className="relative">
        <h2
          className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: "var(--color-text-muted)" }}
        >
          快捷入口
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {MODULES.map((m) => (
            <Link
              key={m.key}
              href={m.path}
              className="card card-interactive group flex items-center gap-3 p-3.5"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] transition-transform duration-150 group-hover:scale-105"
                style={{
                  backgroundColor: `color-mix(in srgb, ${m.accent} 12%, transparent)`,
                  color: m.accent,
                }}
                aria-hidden
              >
                <m.icon size={17} strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{m.name}</span>
                <span className="block truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {m.status === "ready" ? "可用" : m.status === "integrating" ? "接入中" : "即将开放"}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
