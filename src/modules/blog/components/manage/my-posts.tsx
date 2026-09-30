"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Eye,
  EyeOff,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  Lock,
  PenLine,
  Plus,
  Rocket,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { useToast } from "@/components/feedback/toast";
import {
  archivePostAction,
  deletePostAction,
  getPostForEditAction,
  listMineAction,
  publishPostAction,
  unarchivePostAction,
} from "../../actions/post.actions";
import type { PostListItemDTO } from "../../types";
import { formatCount, formatDateTime, formatReadingTime } from "../../lib/format";

/**
 * 我的文章管理（PRD §5.1）。
 *
 * 状态标签页 / 搜索（500ms 防抖）/ 排序 / 视图切换（列表·卡片，偏好持久化）
 * 服务端分页（cursor）—— 切页签、改排序、搜索都重新拉第一页；
 * "加载更多"仅在当前筛选内追加。
 *
 * 操作菜单以"悬停整行显示图标"实现（PRD 明示的交互），草稿可直接发布
 * （拉取全文 → publishPostAction，走完整审核门禁）。
 */

type Tab = "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";
type SortKey = "updated" | "published" | "views";
type ViewStyle = "list" | "cards";

const TABS: { key: Tab; label: string }[] = [
  { key: "DRAFT", label: "草稿" },
  { key: "REVIEW", label: "待审" },
  { key: "PUBLISHED", label: "已发布" },
  { key: "ARCHIVED", label: "已归档" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "updated", label: "最近更新" },
  { key: "published", label: "最近发布" },
  { key: "views", label: "阅读量" },
];

const VIEW_STYLE_KEY = "pwb:blog:list-style";
const TAKE = 20;

function statusBadge(item: PostListItemDTO): { text: string; color: string; bg: string } {
  if (item.status === "DRAFT" && item.auditStatus === "REJECTED") {
    return { text: "已驳回", color: "var(--color-danger)", bg: "color-mix(in srgb, var(--color-danger) 12%, transparent)" };
  }
  switch (item.status) {
    case "DRAFT":
      return { text: "草稿", color: "var(--color-text-muted)", bg: "color-mix(in srgb, var(--color-text-muted) 12%, transparent)" };
    case "REVIEW":
      return { text: "待审", color: "var(--color-warning)", bg: "color-mix(in srgb, var(--color-warning) 14%, transparent)" };
    case "PUBLISHED":
      return { text: "已发布", color: "var(--color-success)", bg: "color-mix(in srgb, var(--color-success) 13%, transparent)" };
    case "ARCHIVED":
      return { text: "已归档", color: "var(--color-info)", bg: "color-mix(in srgb, var(--color-info) 13%, transparent)" };
  }
}

/** 可见性标记：图标本身不带文本，标题经外层 span 提供原生提示 */
function VisibilityIcon({ item }: { item: PostListItemDTO }) {
  if (item.visibility === "PRIVATE")
    return (
      <span className="inline-flex" title="私密">
        <Lock size={12} aria-hidden style={{ color: "var(--color-text-muted)" }} />
      </span>
    );
  if (item.visibility === "UNLISTED")
    return (
      <span className="inline-flex" title="不列出">
        <EyeOff size={12} aria-hidden style={{ color: "var(--color-text-muted)" }} />
      </span>
    );
  return null;
}

export function MyPosts({
  initialItems,
  initialCursor,
  initialTab,
}: {
  initialItems: PostListItemDTO[];
  initialCursor: string | null;
  initialTab: Tab;
}) {
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [sort, setSort] = useState<SortKey>("updated");
  const [viewStyle, setViewStyle] = useState<ViewStyle>("list");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [items, setItems] = useState<PostListItemDTO[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PostListItemDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  const firstRenderRef = useRef(true);
  const querySeqRef = useRef(0);

  // 视图样式偏好持久化
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_STYLE_KEY);
    if (saved === "list" || saved === "cards") setViewStyle(saved);
  }, []);

  const changeViewStyle = useCallback((next: ViewStyle) => {
    setViewStyle(next);
    try {
      window.localStorage.setItem(VIEW_STYLE_KEY, next);
    } catch {
      /* 隐私模式降级 */
    }
  }, []);

  // 搜索防抖 500ms
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 500);
    return () => window.clearTimeout(t);
  }, [q]);

  /** 拉取第一页（tab/q/sort 变化时） */
  const reload = useCallback(async () => {
    const seq = ++querySeqRef.current;
    setLoading(true);
    const res = await listMineAction({ status: tab, q: debouncedQ || undefined, sort, take: TAKE });
    if (seq !== querySeqRef.current) return; // 竞态：只应用最新一次
    setLoading(false);
    if (res.success) {
      setItems(res.data.items);
      setCursor(res.data.nextCursor);
    } else {
      toast("error", res.error.message);
    }
  }, [tab, debouncedQ, sort, toast]);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    void reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const res = await listMineAction({ status: tab, q: debouncedQ || undefined, sort, cursor, take: TAKE });
    setLoadingMore(false);
    if (res.success) {
      setItems((prev) => [...prev, ...res.data.items]);
      setCursor(res.data.nextCursor);
    } else {
      toast("error", res.error.message);
    }
  }, [cursor, loadingMore, tab, debouncedQ, sort, toast]);

  /** 操作后的统一刷新：列表 + 页头统计（router.refresh 重渲 RSC） */
  const refreshAll = useCallback(async () => {
    await reload();
    router.refresh();
  }, [reload, router]);

  // ───────── 行操作 ─────────

  const handlePublish = useCallback(
    async (item: PostListItemDTO) => {
      setBusyId(item.id);
      const editRes = await getPostForEditAction({ id: item.id });
      if (!editRes.success) {
        setBusyId(null);
        toast("error", editRes.error.message);
        return;
      }
      const p = editRes.data;
      const res = await publishPostAction({
        id: p.id,
        title: p.title,
        excerpt: p.excerpt ?? "",
        contentMd: p.contentMd,
        coverImage: p.coverImage,
        tagNames: p.tags.map((t) => t.name),
        visibility: p.visibility,
        allowComment: p.allowComment,
        allowRepost: p.allowRepost,
        seoTitle: p.seoTitle ?? "",
        seoDesc: p.seoDesc ?? "",
        ogImage: p.ogImage,
      });
      setBusyId(null);
      if (res.success) {
        toast("success", res.data.status === "REVIEW" ? "已提交审核" : "发布成功");
        await refreshAll();
      } else {
        toast("error", res.error.message);
      }
    },
    [toast, refreshAll],
  );

  const handleArchive = useCallback(
    async (item: PostListItemDTO) => {
      setBusyId(item.id);
      const res = item.status === "ARCHIVED" ? await unarchivePostAction({ id: item.id }) : await archivePostAction({ id: item.id });
      setBusyId(null);
      if (res.success) {
        toast("success", item.status === "ARCHIVED" ? "已取消归档（回到草稿）" : "已归档");
        await refreshAll();
      } else {
        toast("error", res.error.message);
      }
    },
    [toast, refreshAll],
  );

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const res = await deletePostAction({ id: confirmDelete.id });
    setDeleting(false);
    if (res.success) {
      toast("success", "已移入回收站（30 天内可恢复）");
      setConfirmDelete(null);
      await refreshAll();
    } else {
      toast("error", res.error.message);
    }
  }, [confirmDelete, toast, refreshAll]);

  // ───────── 渲染 ─────────

  const isEmpty = items.length === 0;
  const searching = debouncedQ.length > 0;

  const emptyNode = useMemo(() => {
    if (loading) {
      return (
        <div className="flex justify-center py-16">
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-text-muted)" }} />
        </div>
      );
    }
    if (searching) {
      return (
        <EmptyState
          kind="generic"
          compact
          title="没有找到匹配的文章"
          description={`没有标题或摘要包含「${debouncedQ}」的文章`}
          action={
            <button type="button" className="btn btn-ghost text-xs" onClick={() => setQ("")}>
              <X size={13} />
              清除搜索
            </button>
          }
        />
      );
    }
    if (tab === "DRAFT") {
      return (
        <EmptyState
          kind="generic"
          title="没有草稿"
          description="灵感来时随手记，稍后再打磨"
          action={
            <Link href="/blog/new" className="btn btn-primary gap-1 text-xs">
              <Plus size={13} />
              写文章
            </Link>
          }
        />
      );
    }
    return <EmptyState kind="generic" compact title="这里还没有内容" description="换个状态页签看看吧" />;
  }, [loading, searching, debouncedQ, tab]);

  return (
    <div className="space-y-4">
      {/* 状态标签页 */}
      <div className="relative flex items-center gap-1 border-b" style={{ borderColor: "var(--color-border)" }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              className="relative px-3 py-2 text-sm transition-colors"
              style={{ color: active ? "var(--color-primary)" : "var(--color-text-secondary)", fontWeight: active ? 600 : 400 }}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-all duration-[240ms]"
                style={{
                  backgroundColor: "var(--color-primary)",
                  opacity: active ? 1 : 0,
                  transform: active ? "scaleX(1)" : "scaleX(0.4)",
                }}
              />
            </button>
          );
        })}
      </div>

      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-text-muted)" }}
          />
          <input
            className="input pl-8"
            placeholder="搜索标题或摘要…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="input w-auto"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="排序方式"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-0.5 rounded-[var(--radius-sm,6px)] border p-0.5" style={{ borderColor: "var(--color-border)" }}>
          <button
            type="button"
            aria-label="列表视图"
            className="rounded px-1.5 py-1"
            style={{
              color: viewStyle === "list" ? "var(--color-primary)" : "var(--color-text-muted)",
              backgroundColor: viewStyle === "list" ? "color-mix(in srgb, var(--color-primary) 9%, transparent)" : "transparent",
            }}
            onClick={() => changeViewStyle("list")}
          >
            <ListIcon size={15} />
          </button>
          <button
            type="button"
            aria-label="卡片视图"
            className="rounded px-1.5 py-1"
            style={{
              color: viewStyle === "cards" ? "var(--color-primary)" : "var(--color-text-muted)",
              backgroundColor: viewStyle === "cards" ? "color-mix(in srgb, var(--color-primary) 9%, transparent)" : "transparent",
            }}
            onClick={() => changeViewStyle("cards")}
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      {/* 列表 / 卡片 */}
      {isEmpty ? (
        emptyNode
      ) : viewStyle === "list" ? (
        <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
          {items.map((item) => (
            <PostRow
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onPublish={() => void handlePublish(item)}
              onArchive={() => void handleArchive(item)}
              onDelete={() => setConfirmDelete(item)}
            />
          ))}
        </ul>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <PostCardItem
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onPublish={() => void handlePublish(item)}
              onArchive={() => void handleArchive(item)}
              onDelete={() => setConfirmDelete(item)}
            />
          ))}
        </div>
      )}

      {/* 加载更多 */}
      {cursor && !isEmpty && (
        <div className="flex justify-center pt-2">
          <button type="button" className="btn btn-ghost text-xs" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? <Loader2 size={13} className="animate-spin" /> : null}
            加载更多
          </button>
        </div>
      )}

      {/* 删除确认 */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="删除这篇文章？"
        message={`「${confirmDelete?.title || "未命名草稿"}」将移入回收站，30 天内可在回收站恢复。`}
        confirmText="删除"
        danger
        busy={deleting}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

// ───────── 行操作按钮组（悬停整行显示，默认半透明）─────────

function RowActions({
  item,
  busy,
  onPublish,
  onArchive,
  onDelete,
}: {
  item: PostListItemDTO;
  busy: boolean;
  onPublish: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const canPublish = item.status === "DRAFT" || item.status === "ARCHIVED";
  const canArchive = item.status === "PUBLISHED" || item.status === "ARCHIVED";
  return (
    <div className="flex shrink-0 items-center gap-0.5 opacity-45 transition-opacity group-hover:opacity-100">
      {busy && <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-text-muted)" }} />}
      <Link href={`/blog/${item.id}/edit`} className="icon-btn h-7 w-7" title="编辑" aria-label="编辑">
        <PenLine size={14} />
      </Link>
      <Link href={`/blog/${item.id}/edit?preview=1`} className="icon-btn h-7 w-7" title="预览" aria-label="预览">
        <Eye size={14} />
      </Link>
      {item.status === "PUBLISHED" && (
        <Link href={`/blog/p/${item.slug}`} className="icon-btn h-7 w-7" title="查看线上文章" aria-label="查看线上文章">
          <Rocket size={14} />
        </Link>
      )}
      {canPublish && (
        <button type="button" className="icon-btn h-7 w-7" title="发布" aria-label="发布" disabled={busy} onClick={onPublish}>
          <Rocket size={14} />
        </button>
      )}
      {canArchive && (
        <button
          type="button"
          className="icon-btn h-7 w-7"
          title={item.status === "ARCHIVED" ? "取消归档" : "归档"}
          aria-label={item.status === "ARCHIVED" ? "取消归档" : "归档"}
          disabled={busy}
          onClick={onArchive}
        >
          {item.status === "ARCHIVED" ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        </button>
      )}
      <button type="button" className="icon-btn h-7 w-7" title="删除" aria-label="删除" disabled={busy} onClick={onDelete}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function PostMeta({ item }: { item: PostListItemDTO }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
      <span>{item.wordCount.toLocaleString("zh-CN")} 字</span>
      <span>{formatReadingTime(item.readingMinutes)}</span>
      {item.status === "PUBLISHED" && (
        <span className="flex items-center gap-1">
          <Eye size={11} /> {formatCount(item.viewCount)}
          <span className="mx-0.5">·</span>♥ {formatCount(item.likeCount)}
          <span className="mx-0.5">·</span>💬 {formatCount(item.commentCount)}
        </span>
      )}
      <span>{formatDateTime(item.updatedAt)}</span>
    </div>
  );
}

function PostRow({
  item,
  busy,
  onPublish,
  onArchive,
  onDelete,
}: {
  item: PostListItemDTO;
  busy: boolean;
  onPublish: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const badge = statusBadge(item);
  return (
    <li className="group flex items-center gap-3 px-1 py-3 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text-primary)_3%,transparent)]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/blog/${item.id}/edit`}
            className="truncate text-sm font-medium transition-colors hover:text-[var(--color-primary)]"
            style={{ color: "var(--color-text-primary)" }}
          >
            {item.title || "（未命名草稿）"}
          </Link>
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px]" style={{ color: badge.color, backgroundColor: badge.bg }}>
            {badge.text}
          </span>
          <VisibilityIcon item={item} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {item.tags.length > 0 && (
            <span className="flex items-center gap-1.5">
              {item.tags.slice(0, 3).map((t) => (
                <span key={t.id} className="flex items-center gap-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
                  {t.name}
                </span>
              ))}
            </span>
          )}
          <PostMeta item={item} />
        </div>
      </div>
      <RowActions item={item} busy={busy} onPublish={onPublish} onArchive={onArchive} onDelete={onDelete} />
    </li>
  );
}

function PostCardItem({
  item,
  busy,
  onPublish,
  onArchive,
  onDelete,
}: {
  item: PostListItemDTO;
  busy: boolean;
  onPublish: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const badge = statusBadge(item);
  return (
    <div className="group flex flex-col gap-2 rounded-[var(--radius)] border p-3.5 transition-colors" style={{ borderColor: "var(--color-border)" }}>
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/blog/${item.id}/edit`}
          className="line-clamp-2 min-h-[2.5em] text-sm font-medium transition-colors hover:text-[var(--color-primary)]"
          style={{ color: "var(--color-text-primary)" }}
        >
          {item.title || "（未命名草稿）"}
        </Link>
        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px]" style={{ color: badge.color, backgroundColor: badge.bg }}>
          {badge.text}
        </span>
      </div>
      <p className="line-clamp-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
        {item.excerpt || "（暂无摘要）"}
      </p>
      <PostMeta item={item} />
      <div className="mt-1 flex justify-end border-t pt-2" style={{ borderColor: "var(--color-border)" }}>
        <RowActions item={item} busy={busy} onPublish={onPublish} onArchive={onArchive} onDelete={onDelete} />
      </div>
    </div>
  );
}
