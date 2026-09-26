"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/feedback/empty-state";
import { GuestPromptDialog } from "@/components/feedback/guest-prompt-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import { toggleHabitLogAction } from "../actions/habit-actions";
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

/** 习惯看板（PRD §5.2） */
export function HabitBoard({
  initialHabits,
  today,
  isGuest,
}: {
  initialHabits: HabitDTO[];
  today: string;
  isGuest: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [habits, setHabits] = useState<HabitDTO[]>(initialHabits);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HabitDTO | null>(null);
  const [guestPrompt, setGuestPrompt] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<HabitDTO | null>(null);

  function openCreate() {
    if (isGuest) {
      setGuestPrompt(true);
      return;
    }
    setEditing(null);
    setDialogOpen(true);
  }

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
      <div className="flex justify-end">
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
      ) : (
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
