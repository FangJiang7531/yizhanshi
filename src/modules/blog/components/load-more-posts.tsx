"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { loadMorePostsAction } from "../actions/public.actions";
import { PostList } from "./post-card";
import type { PostListItemDTO } from "../types";

/**
 * 公开列表的"加载更多"（发现页 / 作者页 / 标签页共用）。
 *
 * 首屏数据由服务端静态渲染注入，本组件只负责追加 —— 这样首屏既能被 ISR 缓存，
 * 又不必为了分页把整条路由变成动态渲染（见 public.actions.ts 的说明）。
 *
 * 失败处理：保留已加载内容 + 显示可重试的错误条，不做"整体重来"，
 * 避免用户已经读到的内容因一次网络抖动消失。
 */
export function LoadMorePosts({
  scope,
  tab,
  tag,
  username,
  initialCursor,
}: {
  scope: "all" | "tag" | "author";
  tab?: "latest" | "hot";
  tag?: string;
  username?: string;
  initialCursor: string | null;
}) {
  const [items, setItems] = useState<PostListItemDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (loading || !cursor) return;
    setLoading(true);
    setError(null);
    const res = await loadMorePostsAction({ scope, tab, tag, username, cursor, take: 20 });
    setLoading(false);
    if (!res.success) {
      setError(res.error.message || "加载失败，请稍后重试");
      return;
    }
    setItems((prev) => [...prev, ...res.data.items]);
    setCursor(res.data.nextCursor);
  }

  // 首屏已到底且没有追加内容 → 无需渲染任何控制条
  if (!initialCursor && items.length === 0) return null;

  return (
    <div>
      {items.length > 0 && (
        <>
          <Divider />
          <PostList items={items} />
        </>
      )}

      <div className="flex flex-col items-center gap-2 pt-6">
        {error && (
          <p role="alert" className="text-xs" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}
        {cursor ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
            {loading && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {loading ? "加载中…" : error ? "重试" : "加载更多"}
          </button>
        ) : (
          items.length > 0 && (
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              已经到底了
            </p>
          )
        )}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div
      aria-hidden
      className="h-px"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-border) 70%, transparent)" }}
    />
  );
}
