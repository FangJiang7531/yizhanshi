"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import type { TagDTO, TaskDTO } from "../types";
import { createTaskAction, updateTaskAction, createTagAction } from "../actions/task-actions";
import { useToast } from "@/components/feedback/toast";

const PRIORITY_OPTIONS = [
  { value: "HIGH", label: "高" },
  { value: "MEDIUM", label: "中" },
  { value: "LOW", label: "低" },
] as const;

const TAG_COLORS = [
  "#6366F1", "#4A7C59", "#B4543E", "#C08A3E", "#5B7A9D", "#A8552F",
  "#7C3AED", "#0E7490", "#BE185D", "#4D7C0F", "#B45309", "#334155",
];

export type TaskDialogResult = "created" | "updated" | null;

/** 新增/编辑任务对话框（PRD §5.1.3） */
export function TaskDialog({
  open,
  task,
  tags,
  today,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = 新建模式 */
  task: TaskDTO | null;
  tags: TagDTO[];
  today: string;
  onClose: () => void;
  onSaved: (task: TaskDTO, mode: "created" | "updated") => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<string>("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagOptions, setTagOptions] = useState<TagDTO[]>(tags);
  const [tagQuery, setTagQuery] = useState("");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // 打开时同步表单初值
  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setDueDate(task?.dueAt ? isoToDueDateInput(task.dueAt) : "");
    setPriority(task?.priority ?? "MEDIUM");
    setSelectedTagIds(task?.tags.map((t) => t.id) ?? []);
    setTagOptions(tags);
    setTagQuery("");
    setTagPickerOpen(false);
    setDirty(false);
  }, [open, task, tags]);

  const maxDescription = 2000;
  const titleValid = title.trim().length > 0 && title.trim().length <= 200;

  const filteredTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return tagOptions;
    return tagOptions.filter((t) => t.name.toLowerCase().includes(q));
  }, [tagOptions, tagQuery]);

  const canCreateTag =
    tagQuery.trim().length > 0 &&
    !tagOptions.some((t) => t.name.toLowerCase() === tagQuery.trim().toLowerCase());

  function track<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  function shiftDate(days: number): string {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  async function handleCreateTag(name: string) {
    const res = await createTagAction({ name, color: newTagColor });
    if (res.success) {
      const tag = res.data as TagDTO;
      setTagOptions((prev) => [...prev, tag]);
      setSelectedTagIds((prev) => [...prev, tag.id]);
      setTagQuery("");
      setTagPickerOpen(false);
      toast("success", `标签「${tag.name}」已创建`);
    } else {
      toast("error", res.error.message);
    }
  }

  async function handleSubmit() {
    if (!titleValid || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        dueDate: dueDate || null,
        priority,
        tagIds: selectedTagIds,
      };
      const res = task
        ? await updateTaskAction({ ...payload, id: task.id })
        : await createTaskAction(payload);
      if (res.success) {
        const saved = res.data as TaskDTO;
        toast("success", task ? "任务已更新" : "任务已创建");
        onSaved(saved, task ? "updated" : "created");
        onClose();
      } else {
        toast("error", res.error.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function requestClose() {
    if (dirty && !submitting) {
      setConfirmDiscard(true);
    } else {
      onClose();
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        title={task ? "编辑任务" : "新增任务"}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={requestClose} disabled={submitting}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSubmit()}
              disabled={!titleValid || submitting}
            >
              {submitting ? <Spinner /> : null}
              {submitting ? "保存中…" : task ? "保存" : "创建"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="task-title">
              标题 <span style={{ color: "var(--color-danger)" }}>*</span>
            </label>
            <input
              id="task-title"
              className="input"
              value={title}
              maxLength={200}
              placeholder="要做什么？"
              onChange={(e) => track(setTitle)(e.target.value)}
              aria-invalid={title.trim().length === 0 && dirty}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="task-desc">
              描述
            </label>
            <div className="relative">
              <textarea
                id="task-desc"
                className="input resize-none"
                rows={3}
                maxLength={maxDescription}
                value={description}
                placeholder="补充细节（可选）"
                onChange={(e) => track(setDescription)(e.target.value)}
                style={{ minHeight: "4.5rem", maxHeight: "16rem" }}
              />
              <span
                className="absolute bottom-2 right-3 text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                剩余 {maxDescription - description.length}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="task-due">
                截止日期
              </label>
              <input
                id="task-due"
                type="date"
                className="input"
                value={dueDate}
                onChange={(e) => track(setDueDate)(e.target.value)}
              />
              <div className="mt-1.5 flex gap-1.5">
                <QuickChip label="今天" active={dueDate === today} onClick={() => track(setDueDate)(today)} />
                <QuickChip label="明天" active={dueDate === shiftDate(1)} onClick={() => track(setDueDate)(shiftDate(1))} />
                <QuickChip label="下周" active={dueDate === shiftDate(7)} onClick={() => track(setDueDate)(shiftDate(7))} />
                {dueDate ? <QuickChip label="清除" active={false} onClick={() => track(setDueDate)("")} /> : null}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="task-priority">
                优先级
              </label>
              <select
                id="task-priority"
                className="input"
                value={priority}
                onChange={(e) => track(setPriority)(e.target.value as "LOW" | "MEDIUM" | "HIGH")}
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium">标签（最多 10 个）</span>
            <div className="flex flex-wrap gap-1.5">
              {tagOptions
                .filter((t) => selectedTagIds.includes(t.id))
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="chip"
                    onClick={() => track(setSelectedTagIds)(selectedTagIds.filter((id) => id !== t.id))}
                    aria-label={`移除标签 ${t.name}`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name} ×
                  </button>
                ))}
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setTagPickerOpen((v) => !v)}>
                ＋ 选择标签
              </button>
            </div>

            {tagPickerOpen && (
              <div
                className="pop-in mt-2 rounded-[var(--radius)] border p-2"
                style={{ backgroundColor: "var(--color-bg-base)" }}
              >
                <input
                  className="input mb-2"
                  placeholder="搜索或新建标签…"
                  value={tagQuery}
                  onChange={(e) => setTagQuery(e.target.value)}
                />
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {filteredTags
                    .filter((t) => !selectedTagIds.includes(t.id))
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm hover:opacity-80"
                        style={{ backgroundColor: "var(--color-bg-elevated)" }}
                        onClick={() => {
                          track(setSelectedTagIds)([...selectedTagIds, t.id]);
                          setTagPickerOpen(false);
                        }}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </button>
                    ))}
                  {canCreateTag && (
                    <div className="rounded-[var(--radius-sm)] p-2" style={{ backgroundColor: "var(--color-bg-elevated)" }}>
                      <button
                        type="button"
                        className="text-sm font-medium"
                        style={{ color: "var(--color-primary)" }}
                        onClick={() => void handleCreateTag(tagQuery.trim())}
                      >
                        ＋ 新建标签「{tagQuery.trim()}」
                      </button>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {TAG_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`选择颜色 ${c}`}
                            onClick={() => setNewTagColor(c)}
                            className="h-5 w-5 rounded-full"
                            style={{
                              backgroundColor: c,
                              outline: newTagColor === c ? "2px solid var(--color-text-primary)" : "none",
                              outlineOffset: 1,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="放弃未保存的修改？"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDiscard(false)}>
              继续编辑
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                setConfirmDiscard(false);
                onClose();
              }}
            >
              放弃修改
            </button>
          </>
        }
      >
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          关闭对话框将丢失未保存的修改。
        </p>
      </Modal>
    </>
  );
}

function QuickChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-2.5 py-0.5 text-xs transition-colors"
      style={{
        border: "1px solid var(--color-border)",
        backgroundColor: active ? "var(--color-primary)" : "transparent",
        color: active ? "var(--color-primary-fg)" : "var(--color-text-secondary)",
      }}
    >
      {label}
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function isoToDueDateInput(iso: string): string {
  return iso.slice(0, 10);
}
