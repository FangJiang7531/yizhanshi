"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import { createHabitAction, updateHabitAction, archiveHabitAction, deleteHabitAction } from "../actions/habit-actions";
import { HABIT_COLORS, HABIT_ICONS, DEFAULT_HABIT_ICON, DEFAULT_HABIT_COLOR, type HabitIcon } from "../schemas";
import { HabitIconView } from "./habit-icon";
import type { HabitDTO } from "../types";
import { Spinner } from "@/modules/tasks/components/task-dialog";

/** 新增/编辑习惯对话框（PRD §5.2.3）：名称/描述/颜色（12+自定义）/图标（24）/每周目标；含归档与删除 */
export function HabitDialog({
  open,
  habit,
  onClose,
  onSaved,
  onRemoved,
}: {
  open: boolean;
  habit: HabitDTO | null;
  onClose: () => void;
  /** 保存成功回调：created 携带新 DTO 供看板本地插入；updated 携带最新 DTO 供就地替换 */
  onSaved: (saved: HabitDTO, mode: "created" | "updated") => void;
  /** 归档/删除成功回调：看板本地移除该习惯 */
  onRemoved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(DEFAULT_HABIT_COLOR);
  const [icon, setIcon] = useState<HabitIcon>(DEFAULT_HABIT_ICON);
  const [targetPerWeek, setTargetPerWeek] = useState(7);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(habit?.name ?? "");
    setDescription(habit?.description ?? "");
    setColor(habit?.color ?? DEFAULT_HABIT_COLOR);
    setIcon(habit?.icon ?? DEFAULT_HABIT_ICON);
    setTargetPerWeek(habit?.targetPerWeek ?? 7);
    setConfirmDelete(false);
    setConfirmArchive(false);
  }, [open, habit]);

  const nameValid = name.trim().length > 0 && name.trim().length <= 50;

  async function handleSubmit() {
    if (!nameValid || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        color,
        icon,
        targetPerWeek,
      };
      const res = habit
        ? await updateHabitAction({ ...payload, id: habit.id })
        : await createHabitAction(payload);
      if (res.success) {
        toast("success", habit ? "习惯已更新" : "习惯已创建");
        onSaved(res.data as HabitDTO, habit ? "updated" : "created");
        onClose();
      } else {
        toast("error", res.error.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    if (!habit) return;
    setBusyAction(true);
    const res = await archiveHabitAction({ id: habit.id });
    setBusyAction(false);
    setConfirmArchive(false);
    if (res.success) {
      toast("success", "习惯已归档，历史数据已保留");
      onRemoved();
      onClose();
    } else {
      toast("error", res.error.message);
    }
  }

  async function handleDelete() {
    if (!habit) return;
    setBusyAction(true);
    const res = await deleteHabitAction({ id: habit.id });
    setBusyAction(false);
    setConfirmDelete(false);
    if (res.success) {
      toast("success", "习惯已删除");
      onRemoved();
      onClose();
    } else {
      toast("error", res.error.message);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={habit ? "编辑习惯" : "新增习惯"}
        footer={
          <>
            {habit ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost mr-auto"
                  onClick={() => setConfirmArchive(true)}
                  disabled={busyAction || submitting}
                >
                  归档
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ color: "var(--color-danger)" }}
                  onClick={() => setConfirmDelete(true)}
                  disabled={busyAction || submitting}
                >
                  删除
                </button>
              </>
            ) : null}
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSubmit()}
              disabled={!nameValid || submitting}
            >
              {submitting ? <Spinner /> : null}
              {submitting ? "保存中…" : habit ? "保存" : "创建"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <HabitIconView icon={icon} color={color} />
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium" htmlFor="habit-name">
                名称 <span style={{ color: "var(--color-danger)" }}>*</span>
              </label>
              <input
                id="habit-name"
                className="input"
                value={name}
                maxLength={50}
                placeholder="例如：每天阅读 30 分钟"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="habit-desc">
              描述
            </label>
            <textarea
              id="habit-desc"
              className="input resize-none"
              rows={2}
              maxLength={500}
              value={description}
              placeholder="记录一下这个习惯的意义（可选）"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium">颜色</span>
            <div className="flex flex-wrap gap-1.5">
              {HABIT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`选择颜色 ${c}`}
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full transition-transform"
                  style={{
                    backgroundColor: c,
                    outline: color === c ? "2px solid var(--color-text-primary)" : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
              <label
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-xs"
                style={{ border: "1px dashed var(--color-border)" }}
                title="自定义颜色"
              >
                ＋
                <input
                  type="color"
                  className="sr-only"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  aria-label="自定义颜色"
                />
              </label>
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium">图标</span>
            <div className="grid grid-cols-8 gap-1.5">
              {HABIT_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  aria-label={`选择图标 ${ic}`}
                  onClick={() => setIcon(ic)}
                  className="flex items-center justify-center rounded-[var(--radius-sm)] py-1.5 transition-colors"
                  style={{
                    backgroundColor: icon === ic ? `color-mix(in srgb, ${color} 20%, transparent)` : "var(--color-bg-elevated)",
                    color: icon === ic ? color : "var(--color-text-secondary)",
                  }}
                >
                  <HabitIconView icon={ic} color={icon === ic ? color : "var(--color-text-secondary)"} size={16} bgSize={24} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="habit-target">
              每周目标：{targetPerWeek} 天
            </label>
            <input
              id="habit-target"
              type="range"
              min={1}
              max={7}
              step={1}
              value={targetPerWeek}
              onChange={(e) => setTargetPerWeek(Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmArchive}
        title="归档习惯"
        message={`归档「${habit?.name ?? ""}」后将从列表隐藏，但全部历史打卡数据会保留，可随时恢复。`}
        confirmText="归档"
        busy={busyAction}
        onConfirm={() => void handleArchive()}
        onCancel={() => setConfirmArchive(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="删除习惯"
        message={`确定删除「${habit?.name ?? ""}」吗？历史打卡记录将一并删除且不可恢复。`}
        confirmText="删除"
        danger
        busy={busyAction}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
