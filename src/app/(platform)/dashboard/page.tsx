import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { MODULES } from "@/config/modules";
import { getDashboardData } from "@/modules/analytics/services/dashboard-service";
import { DashboardSections } from "@/modules/analytics/components/dashboard-sections";
import { toLocalDateString } from "@/lib/date/timezone";
import { Flame, ListChecks, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

/** 总览仪表盘（PRD §5.3）：问候区 + 统计卡片×2 + 今日任务 + 今日习惯 + 快捷入口 */
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

  const stats = [
    {
      icon: CheckCircle2,
      label: "今日完成",
      value: `${data.todayCompletedCount} / ${data.todayCompletedCount + data.todayPendingCount}`,
    },
    { icon: Flame, label: "最长连续", value: `${data.longestStreak} 天` },
  ];

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

      {/* 统计卡片 ×2（数字着色：总览的色彩性格） */}
      <div className="relative grid grid-cols-2 gap-4 lg:max-w-md">
        {stats.map((s) => (
          <div key={s.label} className="card card-interactive p-4">
            <s.icon size={18} style={{ color: "var(--color-primary)" }} aria-hidden />
            <p
              className="mt-2 text-2xl font-semibold tabular-nums"
              style={{ color: "var(--color-primary)" }}
            >
              {s.value}
            </p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

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

      {/* 空状态兜底（鼓励型人格：“今天状态不错”的语气） */}
      {data.todayTasks.length === 0 && data.habits.length === 0 && (
        <div className="card flex items-center gap-3 p-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
          <ListChecks size={18} aria-hidden />
          今天从这里开始：添加一个任务或创建一个习惯。
        </div>
      )}
    </div>
  );
}
