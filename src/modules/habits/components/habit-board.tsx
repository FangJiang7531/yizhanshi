"use client";

import { Archive, ArchiveRestore, LayoutGrid, List, MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/feedback/empty-state";
import { GuestPromptDialog } from "@/components/feedback/guest-prompt-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import { toggleHabitLogAction, unarchiveHabitAction } from "../actions/habit-actions";
import type { HabitDTO, ToggleLogResult } from "../types";
import { HabitDialog } from "./habit-dialog";
import { HabitHeatmap } from "./heatmap";
import { HabitIconView } from "./habit-icon";

/** 打卡按钮：涟漪 + 图标切换回弹（scale 0.9→1.08→1）；已打卡 = 实心 ✓ */
function CheckinButton({
  checked,
  color,
  onClick,
  label,
}: {
  checked: boolean;
  color: string;
  onClick: () => void;
  label: string;
}) {
  const [ripple, setRipple] = useState(0);
  return (
    <button
      type="button"
      onClick={() => {
        setRipple((r) => r + 1);
        onClick();
      }}
      className="relative overflow-hidden rounded-[var(--radius)] text-sm font-medium transition-all active:scale-95"
      style={{
        padding: "8px 20px",
        backgroundColor: checked ? "transparent" : color,
        color: checked ? color : "#fff",
        border: checked ? `1.5px solid ${color}` : "1.5px solid transparent",
      }}
      aria-pressed={checked}
      aria-label={label}
    >
      {checked ? "✓ 已打卡" : "今日打卡"}
      {ripple > 0 && (
        <span
          key={ripple}
          className="pointer-events-none absolute inset-0 rounded-[var(--radius)]"
          style={{ animation: "pulse-glow 500ms var(--ease-out)", backgroundColor: "transparent", boxShadow: `0 0 0 12px ${color}` , opacity: 0 }}
        />
      )}
    </button>
  );
}

/** 连续天数数字滚动递增（如 11 → 12，而非跳变） */
function RollingNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    const step = value > prev.current ? 1 : -1;
    const timer = window.setInterval(() => {
      setDisplay((d) => {
        if (d === value) {
          window.clearInterval(timer);
          return d;
        }
        return d + step;
      });
    }, 40);
    prev.current = value;
    return () => window.clearInterval(timer);
  }, [value]);
  return <>{display}</>;
}

/** 习惯看板（PRD §5.2）：卡片/列表双视图 + 归档管理区 */
export function HabitBoard({
  initialHabits,
  archivedHabits: initialArchived,
  today,
  isGuest,
}: {
  initialHabits: HabitDTO[];
  archivedHabits: HabitDTO[];
  today: string;
  isGuest: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [habits, setHabits] = useState<HabitDTO[]>(initialHabits);
  const [archivedHabits, setArchivedHabits] = useState<HabitDTO[]>(initialArchived);
  const [view, setView] = useState<"card" | "list">("card");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HabitDTO | null>(null);
  const [guestPrompt, setGuestPrompt] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<HabitDTO | null>(null);
  const [celebrate, setCelebrate] = useState<{ key: number; streak: number } | null>(null);

  /** 恢复归档：习惯回到主列表，历史打卡数据完整保留 */
  async function handleUnarchive(h: HabitDTO) {
    const res = await unarchiveHabitAction({ id: h.id });
    if (!res.success) {
      toast("error", res.error.message);
      return;
    }
    setArchivedHabits((prev) => prev.filter((x) => x.id !== h.id));
    setHabits((prev) => [...prev, { ...h, checkedToday: false }]);
    toast("success", `「${h.name}」已恢复，历史打卡数据完整保留`);
    router.refresh();
  }

  function openCreate() {
    if (isGuest) {
      setGuestPrompt(true);
      return;
    }
    setEditing(null);
    setDialogOpen(true);
  }

  // 命令面板「新建习惯」跳转（/habits?create=1）时自动打开新建对话框，随后清理地址栏参数
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "1") {
      openCreate();
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEdit(h: HabitDTO) {
    if (isGuest) {
      setGuestPrompt(true);
      return;
    }
    setEditing(h);
    setDialogOpen(true);
  }

  function requestToggle(h: HabitDTO) {
    if (isGuest) {
      setGuestPrompt(true);
      return;
    }
    // PRD §5.2.2：取消打卡需二次确认；打卡直接执行
    if (h.checkedToday) {
      setConfirmCancel(h);
      return;
    }
    void handleToggle(h);
  }

  async function handleToggle(h: HabitDTO) {
    // 乐观更新 + 服务端切换（幂等 upsert），失败回滚并提示
    const optimistic: HabitDTO = {
      ...h,
      checkedToday: !h.checkedToday,
      currentStreak: h.checkedToday ? Math.max(0, h.currentStreak - 1) : h.currentStreak + 1,
      monthDates: h.checkedToday
        ? h.monthDates.filter((d) => d !== today)
        : [...h.monthDates, today],
    };
    setHabits((prev) => prev.map((x) => (x.id === h.id ? optimistic : x)));

    const res = await toggleHabitLogAction({ habitId: h.id, logDate: today });
    if (!res.success) {
      setHabits((prev) => prev.map((x) => (x.id === h.id ? h : x)));
      toast("error", res.error.message);
      return;
    }
    const result = res.data as ToggleLogResult;
    setHabits((prev) =>
      prev.map((x) =>
        x.id === h.id
          ? { ...x, checkedToday: result.checked, currentStreak: result.currentStreak, longestStreak: result.longestStreak, completionRate: result.completionRate }
          : x,
      ),
    );
    if (result.checked) {
      // 打卡成功：卡通徽标从小到大快速跳出又消失（视觉反馈，PRD §5.2.2）
      setCelebrate({ key: Date.now(), streak: result.currentStreak });
      window.setTimeout(() => setCelebrate(null), 1700);
    }
    toast(
      "success",
      result.checked
        ? `打卡成功 · 连续 ${result.currentStreak} 天`
        : "已取消今日打卡",
    );
    setConfirmCancel(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-[var(--radius)] border p-1"
          style={{ backgroundColor: "var(--color-bg-surface)" }}
          role="tablist"
          aria-label="视图切换"
        >
          {([
            { key: "card", label: "卡片", icon: LayoutGrid },
            { key: "list", label: "列表", icon: List },
          ] as const).map((v) => {
            const active = view === v.key;
            return (
              <button
                key={v.key}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setView(v.key)}
                className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-xs transition-all"
                style={{
                  backgroundColor: active ? "var(--color-primary)" : "transparent",
                  color: active ? "var(--color-primary-fg)" : "var(--color-text-secondary)",
                }}
              >
                <v.icon size={13} aria-hidden />
                {v.label}
              </button>
            );
          })}
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} />
          新增习惯
        </button>
      </div>

      {habits.length === 0 ? (
        <div className="card">
          <EmptyState
            kind="habits"
            title="还没有习惯，点击新增"
            description="建立你的第一个每日习惯"
            action={
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Plus size={16} /> 新增习惯
              </button>
            }
          />
        </div>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {habits.map((h) => (
            <div key={h.id} className="card pop-in flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <HabitIconView icon={h.icon} color={h.color} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEdit(h)} aria-label={`编辑习惯：${h.name}`}>
                  <span className="block truncate text-sm font-semibold">{h.name}</span>
                  {h.description ? (
                    <span className="block truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {h.description}
                    </span>
                  ) : null}
                </button>
                <button type="button" className="icon-btn !h-7 !w-7" onClick={() => openEdit(h)} aria-label="更多操作">
                  <MoreHorizontal size={15} />
                </button>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <span style={{ color: "var(--color-text-secondary)" }}>
                  {h.currentStreak > 0 ? (
                    <>🔥 连续 <RollingNumber value={h.currentStreak} /> 天</>
                  ) : (
                    "还没开始"
                  )}
                </span>
                <span className="flex-1">
                  <span style={{ color: "var(--color-text-secondary)" }}>完成率 {h.completionRate}%</span>
                  <span
                    className="mt-1 block h-1 overflow-hidden rounded-full"
                    style={{ backgroundColor: "var(--color-bg-elevated)" }}
                    aria-hidden
                  >
                    <span
                      className="block h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, h.completionRate)}%`, backgroundColor: h.color }}
                    />
                  </span>
                </span>
              </div>

              <div>
                <CheckinButton
                  checked={h.checkedToday}
                  color={h.color}
                  onClick={() => requestToggle(h)}
                  label={h.checkedToday ? `取消打卡：${h.name}` : `打卡：${h.name}`}
                />
              </div>

              <div>
                <p className="mb-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  当月热力图
                </p>
                <HabitHeatmap monthDates={new Set(h.monthDates)} today={today} color={h.color} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card divide-y overflow-hidden">
          {habits.map((h) => (
            <div key={h.id} className="row-in flex items-center gap-3 px-4 py-3">
              <HabitIconView icon={h.icon} color={h.color} size={17} bgSize={36} />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEdit(h)} aria-label={`编辑习惯：${h.name}`}>
                <span className="block truncate text-sm font-medium">{h.name}</span>
                {h.description ? (
                  <span className="block truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {h.description}
                  </span>
                ) : null}
              </button>
              <span className="hidden w-24 shrink-0 text-xs sm:inline" style={{ color: "var(--color-text-secondary)" }}>
                {h.currentStreak > 0 ? `🔥 连续 ${h.currentStreak} 天` : "还没开始"}
              </span>
              <span className="hidden w-20 shrink-0 text-xs md:inline" style={{ color: "var(--color-text-muted)" }}>
                完成率 {h.completionRate}%
              </span>
              <CheckinButton
                checked={h.checkedToday}
                color={h.color}
                onClick={() => requestToggle(h)}
                label={h.checkedToday ? `取消打卡：${h.name}` : `打卡：${h.name}`}
              />
            </div>
          ))}
        </div>
      )}

      {/* 归档管理区：归档习惯在此列出，可一键恢复（历史打卡数据完整保留） */}
      {archivedHabits.length > 0 && (
        <section className="card overflow-hidden" aria-label="已归档习惯">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-[var(--color-bg-elevated)]"
            onClick={() => setArchivedOpen((v) => !v)}
            aria-expanded={archivedOpen}
          >
            <Archive size={15} style={{ color: "var(--color-text-muted)" }} aria-hidden />
            已归档习惯
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px]"
              style={{ backgroundColor: "var(--color-bg-elevated)", color: "var(--color-text-muted)" }}
            >
              {archivedHabits.length}
            </span>
            <span
              className="ml-auto text-xs transition-transform"
              style={{ color: "var(--color-text-muted)", transform: archivedOpen ? "rotate(180deg)" : "none" }}
              aria-hidden
            >
              ▾
            </span>
          </button>
          {archivedOpen && (
            <div className="divide-y border-t" style={{ borderColor: "var(--color-border)" }}>
              {archivedHabits.map((h) => (
                <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <HabitIconView icon={h.icon} color={h.color} size={16} bgSize={32} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{h.name}</span>
                    <span className="block text-xs" style={{ color: "var(--color-text-muted)" }}>
                      已归档 · 历史打卡数据完整保留
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => void handleUnarchive(h)}
                  >
                    <ArchiveRestore size={14} />
                    恢复
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <HabitDialog
        open={dialogOpen}
        habit={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={(saved, mode) => {
          // 本地即时同步（RSC props 无法驱动 useState 初始值，故不能只依赖 router.refresh）
          setHabits((prev) =>
            mode === "created" ? [saved, ...prev] : prev.map((x) => (x.id === saved.id ? saved : x)),
          );
          router.refresh();
        }}
        onRemoved={() => {
          if (editing) setHabits((prev) => prev.filter((x) => x.id !== editing.id));
          router.refresh();
        }}
      />

      {/* 打卡成功徽标：从大到小弹出 → 短暂停留 → 上浮消失（role=status 供读屏） */}
      {celebrate && (
        <div
          key={celebrate.key}
          className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center"
          role="status"
        >
          <div className="relative flex flex-col items-center">
            <span
              className="celebrate-ring absolute h-28 w-28 rounded-full"
              style={{ border: "3px solid var(--color-primary)" }}
              aria-hidden
            />
            {/* 四散的小星光 */}
            {[
              { x: "-70px", y: "-46px" },
              { x: "66px", y: "-52px" },
              { x: "-58px", y: "42px" },
              { x: "60px", y: "38px" },
            ].map((s, i) => (
              <span
                key={i}
                className="celebrate-spark absolute text-lg"
                style={{ "--spark-x": s.x, "--spark-y": s.y } as React.CSSProperties}
                aria-hidden
              >
                ✦
              </span>
            ))}
            <div
              className="celebrate-badge flex flex-col items-center gap-1 rounded-[var(--radius-lg)] px-6 py-4"
              style={{
                backgroundColor: "var(--color-bg-surface)",
                border: "2px solid var(--color-primary)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <span className="text-3xl" aria-hidden>
                🎉
              </span>
              <span className="text-lg font-bold" style={{ color: "var(--color-primary)" }}>
                打卡成功
              </span>
              <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                已连续 {celebrate.streak} 天，继续保持！
              </span>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel !== null}
        title="取消今日打卡"
        message={`确定取消「${confirmCancel?.name ?? ""}」今日的打卡吗？连续天数与热力图将回退。`}
        confirmText="确认取消"
        cancelText="再想想"
        danger
        onConfirm={() => {
          if (confirmCancel) void handleToggle(confirmCancel);
        }}
        onCancel={() => setConfirmCancel(null)}
      />

      <GuestPromptDialog
        open={guestPrompt}
        onClose={() => setGuestPrompt(false)}
        onConfirm={() => {
          setGuestPrompt(false);
          router.push("/login?mode=register");
        }}
        actionLabel="打卡"
      />
    </div>
  );
}
