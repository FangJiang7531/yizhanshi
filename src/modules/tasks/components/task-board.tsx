"use client";

import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { GuestPromptDialog } from "@/components/feedback/guest-prompt-dialog";
import { useToast } from "@/components/feedback/toast";
import { deleteTaskAction, toggleTaskAction, reorderTasksAction } from "../actions/task-actions";
import type { TaskDTO, TagDTO, TaskFilter } from "../types";
import { TaskDialog } from "./task-dialog";

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: "today", label: "今天" },
  { key: "all", label: "全部" },
  { key: "completed", label: "已完成" },
];

const PRIORITY_STYLE: Record<TaskDTO["priority"], { label: string; color: string }> = {
  HIGH: { label: "高", color: "var(--color-danger)" },
  MEDIUM: { label: "中", color: "var(--color-warning)" },
  LOW: { label: "低", color: "var(--color-success)" },
};

/**
 * 任务看板（PRD §5.1）。
 * 交互反馈全覆盖：搜索防抖 300ms、勾选描边动画、删除淡出收缩、过滤横滑过渡、
 * 访客写操作弹出说明对话框（不静默失败）、骨架屏由 loading.tsx 承担。
 */
export function TaskBoard({
  initialTasks,
  initialTags,
  today,
  timezone,
  isGuest,
}: {
  initialTasks: TaskDTO[];
  initialTags: TagDTO[];
  today: string;
  timezone: string;
  isGuest: boolean;
}) {
  const toast = useToast();
  const router = useRouter();

  const [tasks, setTasks] = useState<TaskDTO[]>(initialTasks);
  const [tags] = useState<TagDTO[]>(initialTags);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDTO | null>(null);
  const [deleting, setDeleting] = useState<TaskDTO | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [guestPrompt, setGuestPrompt] = useState(false);
  // 拖拽排序：仅未完成区可拖；拖动项倾斜+阴影，目标项让位，松手持久化 sortOrder
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  // 筛选与排序（客户端即时生效；拖拽仅在手动排序下可用）
  const [priorityFilter, setPriorityFilter] = useState<"all" | "HIGH" | "MEDIUM" | "LOW">("all");
  const [sortBy, setSortBy] = useState<"manual" | "dueAt" | "priority" | "createdAt">("manual");

  // 搜索防抖 300ms
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  /** 客户端按用户时区判断任务是否属于“今天” */
  function dueLocalDate(t: TaskDTO): string | null {
    if (!t.dueAt) return null;
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(t.dueAt));
  }

  const visible = useMemo(() => {
    let list = tasks;
    if (filter === "today") list = list.filter((t) => !t.completed && dueLocalDate(t) === today);
    else if (filter === "completed") list = list.filter((t) => t.completed);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) => t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q),
      );
    }
    if (priorityFilter !== "all") {
      list = list.filter((t) => t.priority === priorityFilter);
    }
    if (sortBy !== "manual") {
      const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
      list = [...list].sort((a, b) => {
        if (sortBy === "priority") return priorityRank[a.priority] - priorityRank[b.priority];
        if (sortBy === "createdAt") return b.createdAt.localeCompare(a.createdAt);
        // dueAt：无截止日期排最后，其余升序
        if (!a.dueAt && !b.dueAt) return 0;
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return a.dueAt.localeCompare(b.dueAt);
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, filter, search, today, timezone, priorityFilter, sortBy]);

  function guardGuest(): boolean {
    if (isGuest) {
      setGuestPrompt(true);
      return true;
    }
    return false;
  }

  function openCreate() {
    if (guardGuest()) return;
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(t: TaskDTO) {
    if (guardGuest()) return;
    setEditing(t);
    setDialogOpen(true);
  }

  async function handleToggle(t: TaskDTO) {
    if (guardGuest()) return;
    // 乐观更新（交互响应 < 100ms），失败回滚
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed: !x.completed } : x)));
    const res = await toggleTaskAction({ id: t.id, completed: !t.completed });
    if (!res.success) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed: t.completed } : x)));
      toast("error", res.error.message);
    } else {
      const saved = res.data as TaskDTO;
      setTasks((prev) => prev.map((x) => (x.id === t.id ? saved : x)));
      if (filter === "today" && saved.completed) router.refresh();
    }
  }

  /** 把被拖任务移到目标位置：先本地让位预览，松手后持久化到服务端 */
  async function commitReorder(targetId: string) {
    const sourceId = draggingId;
    setDraggingId(null);
    setDropTargetId(null);
    if (!sourceId || sourceId === targetId) return;

    const pending = tasks.filter((t) => !t.completed);
    const from = pending.findIndex((t) => t.id === sourceId);
    const to = pending.findIndex((t) => t.id === targetId);
    if (from < 0 || to < 0) return;
    const moved = pending[from];
    if (!moved) return;

    const reordered = [...pending];
    reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const reorderedIds = reordered.map((t) => t.id);

    // 本地重排：未完成区按新顺序，已完成区保持原相对顺序排在后面
    const completed = tasks.filter((t) => t.completed);
    setTasks([...reordered, ...completed]);

    const res = await reorderTasksAction({ ids: reorderedIds });
    if (!res.success) {
      toast("error", res.error.message);
      router.refresh();
    }
  }

  async function handleDeleteConfirm() {    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    const target = deleting;
    setRemovingIds((prev) => new Set(prev).add(target.id));
    const res = await deleteTaskAction({ id: target.id });
    // 等待淡出动画（250ms）结束后再移除数据
    window.setTimeout(() => {
      setTasks((prev) => prev.filter((x) => x.id !== target.id));
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
    }, 250);
    setDeleteBusy(false);
    setDeleting(null);
    if (!res.success) {
      toast("error", res.error.message);
    } else {
      toast("success", "任务已删除");
    }
  }

  function highlightTitle(title: string): React.ReactNode {
    if (!search) return title;
    const idx = title.toLowerCase().indexOf(search.toLowerCase());
    if (idx < 0) return title;
    return (
      <>
        {title.slice(0, idx)}
        <mark
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-primary) 25%, transparent)",
            color: "inherit",
            borderRadius: 2,
            padding: "0 1px",
          }}
        >
          {title.slice(idx, idx + search.length)}
        </mark>
        {title.slice(idx + search.length)}
      </>
    );
  }

  const hasAny = tasks.length > 0;
  const searching = search.length > 0;

  return (
    <div className="space-y-4">
      {/* 顶部：搜索 + 新增 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-text-muted)" }}
            aria-hidden
          />
          <input
            className="input !pl-9"
            placeholder="搜索任务…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="搜索任务"
          />
          {searchInput && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn !h-6 !w-6"
              onClick={() => setSearchInput("")}
              aria-label="清除搜索"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} />
          新增任务
        </button>
      </div>

      {/* 过滤标签（切换内容区横向滑动过渡） */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-[var(--radius)] border p-1"
          style={{ backgroundColor: "var(--color-bg-surface)" }}
          role="tablist"
          aria-label="任务过滤"
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setFilter(f.key)}
                className="relative rounded-[var(--radius-sm)] px-4 py-1.5 text-sm transition-all"
                style={{
                  backgroundColor: active ? "var(--color-primary)" : "transparent",
                  color: active ? "var(--color-primary-fg)" : "var(--color-text-secondary)",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <select
            className="input !w-auto !py-1.5 text-xs"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as typeof priorityFilter)}
            aria-label="按优先级筛选"
          >
            <option value="all">全部优先级</option>
            <option value="HIGH">仅高优先</option>
            <option value="MEDIUM">仅中优先</option>
            <option value="LOW">仅低优先</option>
          </select>
          <select
            className="input !w-auto !py-1.5 text-xs"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            aria-label="排序方式"
          >
            <option value="manual">手动排序</option>
            <option value="dueAt">按截止时间</option>
            <option value="priority">按优先级</option>
            <option value="createdAt">按创建时间</option>
          </select>
        </div>
      </div>

      {/* 列表 */}
      <div className="card divide-y overflow-hidden" key={filter} style={{ animation: "content-in var(--duration-base) var(--ease-out)" }}>
        {visible.length === 0 ? (
          searching ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                没有找到匹配『{search}』的任务
              </p>
              <button
                type="button"
                className="btn btn-outline btn-sm mt-3"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                }}
              >
                清除搜索
              </button>
            </div>
          ) : hasAny ? (
            <EmptyState compact title="该过滤条件下暂无任务" />
          ) : (
            <EmptyState
              kind="tasks"
              title="暂无任务"
              description="点击右上角新增你的第一个任务"
              action={
                <button type="button" className="btn btn-primary" onClick={openCreate}>
                  <Plus size={16} /> 新增任务
                </button>
              }
            />
          )
        ) : (
          visible.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              removing={removingIds.has(t.id)}
              today={today}
              draggable={!isGuest && filter === "all" && !search && sortBy === "manual"}
              dragging={draggingId === t.id}
              dropTarget={dropTargetId === t.id && draggingId !== null && draggingId !== t.id}
              onDragStart={() => setDraggingId(t.id)}
              onDragEnd={() => {
                setDraggingId(null);
                setDropTargetId(null);
              }}
              onDragOverTask={() => setDropTargetId(t.id)}
              onDropOnTask={() => void commitReorder(t.id)}
              onToggle={() => void handleToggle(t)}
              onEdit={() => openEdit(t)}
              onDelete={() => (guardGuest() ? undefined : setDeleting(t))}
              highlight={highlightTitle}
            />
          ))
        )}
      </div>

      <TaskDialog
        open={dialogOpen}
        task={editing}
        tags={tags}
        today={today}
        onClose={() => setDialogOpen(false)}
        onSaved={(saved, mode) => {
          setTasks((prev) =>
            mode === "created" ? [saved, ...prev] : prev.map((x) => (x.id === saved.id ? saved : x)),
          );
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="删除任务"
        message={`确定删除「${deleting?.title ?? ""}」吗？此操作不可撤销。`}
        confirmText="删除"
        danger
        busy={deleteBusy}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleting(null)}
      />

      <GuestPromptDialog
        open={guestPrompt}
        onClose={() => setGuestPrompt(false)}
        onConfirm={() => {
          setGuestPrompt(false);
          router.push("/login?mode=register");
        }}
        actionLabel="新增任务"
      />
    </div>
  );
}

function TaskRow({
  task,
  removing,
  today,
  draggable,
  dragging,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDragOverTask,
  onDropOnTask,
  onToggle,
  onEdit,
  onDelete,
  highlight,
}: {
  task: TaskDTO;
  removing: boolean;
  today: string;
  draggable: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverTask: () => void;
  onDropOnTask: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  highlight: (title: string) => React.ReactNode;
}) {
  const dueDate = task.dueAt ? new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date(task.dueAt)) : null;
  // dueAt 存储的是用户时区当天 00:00 的 UTC instant，因此用 UTC 分量还原日期串
  const overdue = dueDate !== null && dueDate < today && !task.completed;
  const dueLabel = overdue ? "已逾期" : task.dueLabel;

  return (
    <div
      className={`group flex items-center gap-3 px-4 py-3 transition-all ${removing ? "row-out" : "row-in"}`}
      style={{
        paddingLeft: "calc(var(--density-pad) + 4px)",
        paddingRight: "var(--density-pad)",
        // 拖动项轻微倾斜 + 阴影加深（PRD §7.6 任务拖拽）
        transform: dragging ? "rotate(-1.2deg) scale(1.01)" : undefined,
        boxShadow: dragging ? "var(--shadow-lg)" : undefined,
        opacity: dragging ? 0.92 : undefined,
        backgroundColor: dropTarget ? "var(--color-bg-elevated)" : undefined,
        borderTop: dropTarget ? "2px solid var(--color-primary)" : undefined,
        zIndex: dragging ? 5 : undefined,
        position: "relative",
      }}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onDragOver={draggable ? (e) => { e.preventDefault(); onDragOverTask(); } : undefined}
      onDrop={draggable ? (e) => { e.preventDefault(); onDropOnTask(); } : undefined}
    >
      {/* 复选框：40×40 热区，SVG 描边绘制 */}
      <button
        type="button"
        role="checkbox"
        aria-checked={task.completed}
        aria-label={task.completed ? `取消完成：${task.title}` : `完成：${task.title}`}
        onClick={onToggle}
        className="flex h-10 w-10 shrink-0 items-center justify-center"
      >
        <span
          className="flex h-5 w-5 items-center justify-center rounded-[5px] border-2 transition-colors"
          style={{
            borderColor: task.completed ? "var(--color-primary)" : "var(--color-border)",
            backgroundColor: task.completed ? "var(--color-primary)" : "transparent",
          }}
        >
          {task.completed && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="check-draw">
              <path
                d="M4 12.5l5 5L20 6.5"
                stroke="var(--color-primary-fg)"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </button>

      {/* 标题 + 描述 */}
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
        aria-label={`编辑任务：${task.title}`}
      >
        <span
          className="block truncate text-sm font-medium transition-colors"
          style={{
            textDecoration: task.completed ? "line-through" : "none",
            color: task.completed ? "var(--color-text-muted)" : "var(--color-text-primary)",
          }}
        >
          {highlight(task.title)}
        </span>
        {task.description ? (
          <span className="block truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
            {task.description}
          </span>
        ) : null}
      </button>

      {/* 截止日期 */}
      {dueLabel ? (
        <span
          className="hidden shrink-0 text-xs sm:inline"
          style={{ color: overdue ? "var(--color-danger)" : "var(--color-text-muted)" }}
        >
          {dueLabel}
        </span>
      ) : null}

      {/* 优先级 */}
      <span
        className="hidden shrink-0 rounded-full px-2 py-0.5 text-xs sm:inline"
        style={{
          color: PRIORITY_STYLE[task.priority].color,
          border: `1px solid ${PRIORITY_STYLE[task.priority].color}`,
          opacity: task.completed ? 0.4 : 1,
        }}
      >
        {PRIORITY_STYLE[task.priority].label}
      </span>

      {/* 标签（≤3，超出 +N） */}
      <span className="hidden shrink-0 items-center gap-1 md:flex">
        {task.tags.slice(0, 3).map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
            style={{ backgroundColor: `color-mix(in srgb, ${tag.color} 16%, transparent)`, color: tag.color }}
          >
            {tag.name}
          </span>
        ))}
        {task.tags.length > 3 ? (
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            +{task.tags.length - 3}
          </span>
        ) : null}
      </span>

      {/* 编辑/删除：悬停显现 */}
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button type="button" className="icon-btn" onClick={onEdit} aria-label={`编辑：${task.title}`}>
          <Pencil size={15} />
        </button>
        <button type="button" className="icon-btn" onClick={onDelete} aria-label={`删除：${task.title}`}>
          <Trash2 size={15} />
        </button>
      </span>
    </div>
  );
}
