"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Search,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  createBookmarkAction,
  deleteBookmarkAction,
  fetchPageTitleAction,
  listBookmarksAction,
  updateBookmarkAction,
} from "../actions/bookmark-actions";
import type { BookmarkDTO } from "../services/bookmark.service";

/**
 * 书签工作台：收藏夹分组 / 标签云 / 全文搜索 / 星标 / 网站+文章双类型。
 */
export function BookmarksBoard() {
  const toast = useToast();
  const [items, setItems] = useState<BookmarkDTO[]>([]);
  const [folders, setFolders] = useState<{ folder: string; count: number }[]>([]);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | undefined>(undefined);
  const [activeTag, setActiveTag] = useState<string | undefined>(undefined);
  const [q, setQ] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // 新建表单
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState("默认收藏");
  const [tagsInput, setTagsInput] = useState("");
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listBookmarksAction({
      folder: activeFolder,
      tag: activeTag,
      q: q.trim() || undefined,
      favoritesOnly,
    });
    setLoading(false);
    if (res.success) {
      setItems(res.data.items);
      setFolders(res.data.folders);
      setTags(res.data.tags);
    }
  }, [activeFolder, activeTag, q, favoritesOnly]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  async function autoFillTitle() {
    if (!url.trim()) return;
    setFetching(true);
    const res = await fetchPageTitleAction({ url: url.trim() });
    setFetching(false);
    if (res.success && res.data.title) {
      setTitle((prev) => prev || res.data.title!);
    }
  }

  async function submit() {
    if (!url.trim() || !title.trim() || submitting) return;
    setSubmitting(true);
    const res = await createBookmarkAction({
      url: url.trim(),
      title: title.trim(),
      folder: folder.trim() || "默认收藏",
      tags: tagsInput
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8),
    });
    setSubmitting(false);
    if (!res.success) {
      toast("error", res.error.message);
      return;
    }
    setItems((prev) => [res.data, ...prev]);
    setUrl("");
    setTitle("");
    setTagsInput("");
    setShowForm(false);
    toast("success", "已收藏");
    void load();
  }

  async function toggleFavorite(item: BookmarkDTO) {
    const res = await updateBookmarkAction({ id: item.id, isFavorite: !item.isFavorite });
    if (res.success) {
      setItems((prev) => prev.map((x) => (x.id === item.id ? res.data : x)));
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    const res = await deleteBookmarkAction({ id: confirmDelete });
    setConfirmDelete(null);
    if (res.success) {
      setItems((prev) => prev.filter((x) => x.id !== confirmDelete));
      toast("success", "已删除");
      void load();
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
      {/* 侧栏：收藏夹 + 标签云 */}
      <aside className="space-y-5">
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            <FolderOpen size={13} aria-hidden />
            收藏夹
          </h2>
          <ul className="space-y-0.5">
            <li>
              <button
                type="button"
                onClick={() => setActiveFolder(undefined)}
                className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--color-bg-elevated)]"
                style={{ backgroundColor: activeFolder === undefined ? "color-mix(in srgb, var(--color-primary) 9%, transparent)" : undefined, color: activeFolder === undefined ? "var(--color-primary)" : undefined }}
              >
                全部书签
              </button>
            </li>
            {folders.map((f) => (
              <li key={f.folder}>
                <button
                  type="button"
                  onClick={() => setActiveFolder(f.folder)}
                  className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--color-bg-elevated)]"
                  style={{ backgroundColor: activeFolder === f.folder ? "color-mix(in srgb, var(--color-primary) 9%, transparent)" : undefined, color: activeFolder === f.folder ? "var(--color-primary)" : undefined }}
                >
                  <span className="truncate">{f.folder}</span>
                  <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                    {f.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {tags.length > 0 && (
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              <Tag size={13} aria-hidden />
              标签
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  className="chip"
                  style={
                    activeTag === t.tag
                      ? { borderColor: "var(--color-primary)", color: "var(--color-primary)", backgroundColor: "color-mix(in srgb, var(--color-primary) 8%, transparent)" }
                      : undefined
                  }
                  onClick={() => setActiveTag(activeTag === t.tag ? undefined : t.tag)}
                >
                  {t.tag}
                  <span style={{ color: "var(--color-text-muted)" }}>{t.count}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </aside>

      {/* 主区 */}
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} aria-hidden />
            <input
              className="input pl-9"
              placeholder="搜索标题、备注、链接…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="搜索书签"
            />
          </div>
          <button
            type="button"
            className="chip"
            style={favoritesOnly ? { borderColor: "var(--color-warning)", color: "var(--color-warning)" } : undefined}
            onClick={() => setFavoritesOnly((v) => !v)}
            aria-pressed={favoritesOnly}
          >
            <Star size={12} fill={favoritesOnly ? "currentColor" : "none"} aria-hidden />
            星标
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? <X size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
            {showForm ? "收起" : "添加书签"}
          </button>
        </div>

        {showForm && (
          <section className="card space-y-3 p-4">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="网址（https://…）"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => void autoFillTitle()}
                aria-label="书签网址"
              />
              {fetching && <Loader2 size={16} className="mt-3 animate-spin" style={{ color: "var(--color-primary)" }} aria-label="抓取标题中" />}
            </div>
            <input
              className="input"
              placeholder="标题（失焦自动抓取网页标题）"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="书签标题"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                className="input"
                placeholder="收藏夹"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                aria-label="收藏夹"
                list="bookmark-folders"
              />
              <datalist id="bookmark-folders">
                {folders.map((f) => (
                  <option key={f.folder} value={f.folder} />
                ))}
              </datalist>
              <input
                className="input"
                placeholder="标签（空格或逗号分隔，最多 8 个）"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                aria-label="书签标签"
              />
            </div>
            <div className="flex justify-end">
              <button type="button" className="btn btn-primary btn-sm" disabled={!url.trim() || !title.trim() || submitting} onClick={() => void submit()}>
                {submitting ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
                保存书签
              </button>
            </div>
          </section>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-16" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="card p-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
            {q || activeTag || activeFolder ? "没有符合条件的书签" : "还没有书签，点击「添加书签」收藏第一个网站吧"}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="card flex items-center gap-3 p-3.5">
                <button
                  type="button"
                  className="icon-btn shrink-0"
                  aria-label={item.isFavorite ? "取消星标" : "加星标"}
                  onClick={() => void toggleFavorite(item)}
                >
                  <Star size={16} fill={item.isFavorite ? "var(--color-warning)" : "none"} style={{ color: item.isFavorite ? "var(--color-warning)" : "var(--color-text-muted)" }} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5">
                    {item.kind === "post" ? (
                      <FileText size={13} style={{ color: "var(--color-primary)" }} aria-label="站内文章" />
                    ) : (
                      <ExternalLink size={13} style={{ color: "var(--color-text-muted)" }} aria-hidden />
                    )}
                    <a
                      href={item.postPath ?? item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-draw truncate text-sm font-medium"
                    >
                      {item.title}
                    </a>
                  </p>
                  {item.tags.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {item.tags.map((t) => (
                        <span key={t} className="chip" style={{ fontSize: 10, padding: "1px 7px" }}>
                          {t}
                        </span>
                      ))}
                    </p>
                  )}
                  <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {item.folder} · {new URL(item.url).hostname}
                  </p>
                </div>
                <button type="button" className="icon-btn shrink-0" aria-label="删除书签" onClick={() => setConfirmDelete(item.id)}>
                  <Trash2 size={15} style={{ color: "var(--color-danger)" }} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="删除这条书签？"
        message="删除后可重新收藏同一网址。"
        confirmText="删除"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
