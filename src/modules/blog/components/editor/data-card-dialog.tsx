"use client";

import { useEffect, useRef, useState } from "react";
import { Database, Loader2, ListTodo } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/feedback/toast";
import { buildDataCardAction, listDataCardSourcesAction } from "../../actions/data-card.actions";
import type { HabitCardSource } from "../../services/data-card.service";

/**
 * "插入数据卡片"对话框（PRD A-20）。
 *
 * 数据每打开一次拉取一次（习惯列表与打卡进度会变，不值得缓存）。
 * 生成的标记由 shell 插入编辑器 —— 插入时会带去"此刻"的快照，
 * 发布时还会再刷新一次（见 data-card.service.injectSnapshots）。
 */
export function DataCardDialog({
  open,
  onClose,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (marker: string) => void;
}) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [habits, setHabits] = useState<HabitCardSource[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHabits(null);
    void listDataCardSourcesAction().then((res) => {
      if (cancelled) return;
      if (res.success) {
        setHabits(res.data.habits);
      } else {
        setHabits([]);
        toastRef.current("error", res.error.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function insert(params: { kind: "habit"; habitId: string } | { kind: "task" }) {
    const key = params.kind === "habit" ? params.habitId : "task";
    setBusyKey(key);
    const res = await buildDataCardAction(params);
    setBusyKey(null);
    if (res.success) {
      onInsert(res.data.marker);
      onClose();
    } else {
      toastRef.current("error", res.error.message);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="插入数据卡片">
      <div className="space-y-5 text-sm">
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          卡片会把当前数据固化为快照写入正文 —— 历史文章中的数字不会随时间变化。
        </p>

        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
            <Database size={13} />
            习惯打卡卡片
          </h3>
          {habits === null ? (
            <div className="flex items-center gap-2 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
              <Loader2 size={13} className="animate-spin" />
              正在加载习惯…
            </div>
          ) : habits.length === 0 ? (
            <p className="py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
              还没有习惯数据，先到「习惯打卡」创建后再来插入。
            </p>
          ) : (
            <div className="space-y-1">
              {habits.map((habit) => (
                <button
                  key={habit.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-[var(--radius-sm,6px)] border px-3 py-2 text-left transition-colors hover:border-[var(--color-primary)]"
                  style={{ borderColor: "var(--color-border)" }}
                  disabled={busyKey !== null}
                  onClick={() => void insert({ kind: "habit", habitId: habit.id })}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: habit.color }} />
                    <span className="truncate text-xs">{habit.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    {habit.subtitle}
                    {busyKey === habit.id && <Loader2 size={12} className="animate-spin" />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
            <ListTodo size={13} />
            任务进度卡片
          </h3>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-[var(--radius-sm,6px)] border px-3 py-2 text-left transition-colors hover:border-[var(--color-primary)]"
            style={{ borderColor: "var(--color-border)" }}
            disabled={busyKey !== null}
            onClick={() => void insert({ kind: "task" })}
          >
            <span className="text-xs">任务清单整体进度（全部任务 / 已完成）</span>
            {busyKey === "task" && <Loader2 size={12} className="animate-spin" />}
          </button>
        </section>
      </div>
    </Modal>
  );
}
