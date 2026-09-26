"use client";

import { CheckCircle2, Coffee, Flame } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GuestPromptDialog } from "@/components/feedback/guest-prompt-dialog";
import { useToast } from "@/components/feedback/toast";
import { toggleTaskAction } from "@/modules/tasks/actions/task-actions";
import { toggleHabitLogAction } from "@/modules/habits/actions/habit-actions";
import type { TaskDTO } from "@/modules/tasks/types";
import type { HabitDTO } from "@/modules/habits/types";
import { HabitIconView } from "@/modules/habits/components/habit-icon";

/** 总览页可交互区：今日任务可直接勾选完成；今日习惯可直接打卡（与板块页行为一致） */
export function DashboardSections({
  initialTasks,
  habits,
  today,
  isGuest,
}: {
  initialTasks: TaskDTO[];
  habits: HabitDTO[];
  today: string;
  isGuest: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskDTO[]>(initialTasks);
  const [habitList, setHabitList] = useState<HabitDTO[]>(habits);
  const [guestPrompt, setGuestPrompt] = useState(false);

  function guardGuest(): boolean {
    if (isGuest) {
      setGuestPrompt(true);
      return true;
    }
    return false;
  }

  async function handleToggleTask(t: TaskDTO) {
    if (guardGuest()) return;
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed: !x.completed } : x)));
    const res = await toggleTaskAction({ id: t.id, completed: !t.completed });
    if (!res.success) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed: t.completed } : x)));
      toast("error", res.error.message);
      return;
    }
    // 完成后从“今日待办”移除（带淡出）
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    toast("success", "任务已完成");
    router.refresh();
  }

  async function handleCheckin(h: HabitDTO) {
    if (guardGuest()) return;
    const optimistic: HabitDTO = {
      ...h,
      checkedToday: !h.checkedToday,
      currentStreak: h.checkedToday ? Math.max(0, h.currentStreak - 1) : h.currentStreak + 1,
    };
    setHabitList((prev) => prev.map((x) => (x.id === h.id ? optimistic : x)));
    const res = await toggleHabitLogAction({ habitId: h.id, logDate: today });
    if (!res.success) {
      setHabitList((prev) => prev.map((x) => (x.id === h.id ? h : x)));
      toast("error", res.error.message);
      return;
    }
    setHabitList((prev) => prev.map((x) => (x.id === h.id ? { ...x, checkedToday: !h.checkedToday } : x)));
    toast("success", !h.checkedToday ? "打卡成功" : "已取消今日打卡");
    router.refresh();
  }

  const habitsPending = habitList.filter((h) => !h.checkedToday);
  const allHabitsDone = habitList.length > 0 && habitsPending.length === 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* 今日任务 */}
      <section className="card p-4" aria-label="今日任务">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">今日任务</h2>
          <a href="/tasks" className="text-xs" style={{ color: "var(--color-primary)" }}>
            查看全部 →
          </a>
        </header>
        {tasks.length === 0 ? (
          <p className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--color-text-muted)" }}>
            <Coffee size={16} aria-hidden />
            今天没有待办，轻松一下 ☕
          </p>
        ) : (
          <ul className="space-y-1">
            {tasks.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => void handleToggleTask(t)}
                  className="row-in flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-left transition-colors hover:bg-[var(--color-bg-elevated)]"
                  aria-label={`完成：${t.title}`}
                >
                  <span
                    className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2"
                    style={{ borderColor: "var(--color-border)" }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  {t.dueLabel ? (
                    <span className="shrink-0 text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {t.dueLabel}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 今日习惯 */}
      <section className="card p-4" aria-label="今日习惯">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">今日习惯</h2>
          <a href="/habits" className="text-xs" style={{ color: "var(--color-primary)" }}>
            查看全部 →
          </a>
        </header>
        {habitList.length === 0 ? (
          <p className="py-6 text-sm" style={{ color: "var(--color-text-muted)" }}>
            还没有习惯，去创建一个吧
          </p>
        ) : allHabitsDone ? (
          <p className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--color-success)" }}>
            <CheckCircle2 size={16} aria-hidden />
            今日全部完成，太棒了！
          </p>
        ) : (
          <ul className="space-y-1">
            {habitsPending.map((h) => (
              <li key={h.id} className="row-in">
                <div className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5">
                  <HabitIconView icon={h.icon} color={h.color} size={16} bgSize={30} />
                  <span className="min-w-0 flex-1 truncate text-sm">{h.name}</span>
                  {h.currentStreak > 0 ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                      <Flame size={13} style={{ color: h.color }} aria-hidden />
                      {h.currentStreak} 天
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-outline btn-sm shrink-0"
                    onClick={() => void handleCheckin(h)}
                    aria-label={`打卡：${h.name}`}
                  >
                    打卡
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <GuestPromptDialog
        open={guestPrompt}
        onClose={() => setGuestPrompt(false)}
        onConfirm={() => {
          setGuestPrompt(false);
          router.push("/login?mode=register");
        }}
        actionLabel="完成任务与打卡"
      />
    </div>
  );
}
