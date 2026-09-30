"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, PenLine, Search, X } from "lucide-react";
import { searchPostsAction } from "../actions/search.actions";
import { AuthorAvatar } from "./post-card";
import { formatDate, formatReadingTime, truncate } from "../lib/format";
import type { SearchResultDTO, TagCloudItemDTO } from "../types";

/**
 * 搜索视图（PRD §5.7）。
 *
 * 首屏由服务端渲染（?q= 直链可分享、有首屏结果），本组件接管后续交互：
 * 输入 500ms 防抖、≥2 字符触发、游标分页"加载更多"。
 *
 * URL 同步用 history.replaceState 而非 router.replace —— 后者会触发一次
 * 服务端往返并把 RSC 载荷重传一遍，对"每敲两个字"的交互完全不划算；
 * replaceState 只改地址栏，刷新/分享时服务端自然按 ?q= 重渲染。
 */

const DEBOUNCE_MS = 500;
const MIN_LEN = 2;

export function SearchView({
  initialQ,
  initialResult,
  initialPopularTags,
  canWrite,
}: {
  initialQ: string;
  initialResult: SearchResultDTO | null;
  initialPopularTags: TagCloudItemDTO[];
  canWrite: boolean;
}) {
  const [q, setQ] = useState(initialQ);
  const [result, setResult] = useState<SearchResultDTO | null>(initialResult);
  const [popularTags, setPopularTags] = useState<TagCloudItemDTO[]>(initialPopularTags);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 请求序号：防抖后旧响应晚到不许覆盖新响应 */
  const seqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (query: string) => {
    const seq = ++seqRef.current;
    setSearching(true);
    setError(null);
    const res = await searchPostsAction({ q: query, take: 20 });
    if (seq !== seqRef.current) return; // 已被更新的请求取代
    setSearching(false);
    if (!res.success) {
      setError(res.error.message || "搜索失败，请稍后重试");
      return;
    }
    setResult(res.data.result);
    setPopularTags(res.data.popularTags ?? []);
    // canWrite 以首屏为准（登录态在一次会话内不变）
  }, []);

  // 防抖：输入停 500ms 后触发；不足 2 字符清空结果并回到初始推荐
  useEffect(() => {
    const trimmed = q.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (trimmed === initialQ.trim() && result?.q === trimmed) return; // 与首屏相同，不重复请求
    if (trimmed.length < MIN_LEN) {
      seqRef.current++; // 使任何在途请求失效
      setResult(trimmed.length === 0 ? null : { q: trimmed, items: [], nextCursor: null });
      return;
    }
    debounceRef.current = setTimeout(() => void runSearch(trimmed), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, initialQ, result?.q, runSearch]);

  // URL 同步（仅地址栏，不触发导航）
  useEffect(() => {
    const trimmed = q.trim();
    const url = trimmed ? `/blog/search?q=${encodeURIComponent(trimmed)}` : "/blog/search";
    window.history.replaceState(null, "", url);
  }, [q]);

  async function loadMore() {
    if (loadingMore || !result?.nextCursor) return;
    setLoadingMore(true);
    const res = await searchPostsAction({ q: result.q, cursor: result.nextCursor, take: 20 });
    setLoadingMore(false);
    if (!res.success) {
      setError(res.error.message || "加载失败，请重试");
      return;
    }
    setResult((prev) =>
      prev ? { ...prev, items: [...prev.items, ...res.data.result.items], nextCursor: res.data.result.nextCursor } : prev,
    );
  }

  function clear() {
    setQ("");
    setResult(null);
    setPopularTags(initialPopularTags);
  }

  const trimmed = q.trim();
  const showEmpty = result !== null && result.items.length === 0 && !searching;
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_LEN;

  return (
    <div className="space-y-5">
      {/* 搜索框 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (debounceRef.current) clearTimeout(debounceRef.current);
          if (trimmed.length >= MIN_LEN) void runSearch(trimmed);
        }}
        className="relative"
      >
        <Search size={16} aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索标题、摘要、正文或标签…（至少 2 个字符）"
          aria-label="搜索文章"
          autoFocus
          className="input h-11 w-full pl-10 pr-10"
        />
        {q.length > 0 && (
          <button
            type="button"
            onClick={clear}
            aria-label="清空搜索"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)]"
          >
            <X size={14} aria-hidden style={{ color: "var(--color-text-muted)" }} />
          </button>
        )}
      </form>

      {/* 进行中 / 错误 */}
      {searching && (
        <p className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          <Loader2 size={14} className="animate-spin" aria-hidden />
          正在搜索「{trimmed}」…
        </p>
      )}
      {error && (
        <p className="rounded-[var(--radius)] border px-3 py-2 text-sm" style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }} role="alert">
          {error}
        </p>
      )}
      {tooShort && !searching && (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          至少输入 {MIN_LEN} 个字符才开始检索。
        </p>
      )}

      {/* 初始态（未搜索）：热门标签入口 */}
      {result === null && (
        popularTags.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">试试热门标签</p>
            <div className="flex flex-wrap gap-2">
              {popularTags.map((t) => (
                <Link
                  key={t.id}
                  href={`/blog/search?q=${encodeURIComponent(t.name)}`}
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => {
                    e.preventDefault();
                    setQ(t.name);
                  }}
                >
                  {t.name}
                  <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    {t.postCount}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )
      )}

      {/* 空结果：文案 + 推荐标签 + 清除（PRD §5.7 空状态） */}
      {showEmpty && (
        <div className="rounded-[var(--radius)] border border-dashed px-6 py-10 text-center" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-sm">没有找到与「{result.q}」相关的文章</p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
            换个关键词，或从热门标签开始逛逛。
          </p>
          {popularTags.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {popularTags.slice(0, 8).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setQ(t.name)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center justify-center gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>
              清空搜索
            </button>
            {canWrite && (
              <Link href="/blog/new" className="btn btn-primary btn-sm">
                <PenLine size={13} aria-hidden />
                写一篇相关文章
              </Link>
            )}
          </div>
        </div>
      )}

      {/* 结果列表 */}
      {result && result.items.length > 0 && (
        <div>
          <p className="mb-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
            「{result.q}」共 {result.items.length}
            {result.nextCursor ? "+" : ""} 条结果
          </p>
          <div>
            {result.items.map((hit, i) => (
              <div key={hit.id}>
                {i > 0 && (
                  <div
                    aria-hidden
                    className="h-px"
                    style={{ backgroundColor: "color-mix(in srgb, var(--color-border) 70%, transparent)" }}
                  />
                )}
                <SearchHitItem hit={hit} />
              </div>
            ))}
          </div>

          {result.nextCursor && (
            <div className="flex justify-center pt-4">
              <button type="button" className="btn btn-ghost btn-sm" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
                加载更多
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchHitItem({ hit }: { hit: SearchResultDTO["items"][number] }) {
  return (
    <article className="py-4">
      <div className="flex items-baseline justify-between gap-3">
        <Link
          href={`/blog/p/${hit.slug}`}
          className="text-[17px] font-semibold leading-snug transition-colors hover:text-[var(--color-primary)]"
        >
          {/* 已转义、仅含我们插入的 <mark>（见 search.service highlightTitle） */}
          <span dangerouslySetInnerHTML={{ __html: hit.titleHtml }} />
        </Link>
        {hit.publishedAt && (
          <time dateTime={hit.publishedAt} className="shrink-0 text-xs" style={{ color: "var(--color-text-muted)" }}>
            {formatDate(hit.publishedAt)}
          </time>
        )}
      </div>

      {/* 命中片段：无片段（标题/标签命中）时回退摘要 */}
      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
        {hit.snippetHtml ? (
          <span dangerouslySetInnerHTML={{ __html: hit.snippetHtml }} />
        ) : hit.excerpt ? (
          truncate(hit.excerpt, 120)
        ) : null}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
        <span className="flex items-center gap-1.5">
          <AuthorAvatar author={hit.author} size={18} />
          {hit.author.displayName ?? hit.author.username}
        </span>
        <span>{formatReadingTime(hit.readingMinutes)}</span>
        {hit.tags.slice(0, 3).map((t) => (
          <Link
            key={t.id}
            href={`/blog/tags/${encodeURIComponent(t.name)}`}
            className="transition-colors hover:text-[var(--color-primary)]"
          >
            #{t.name}
          </Link>
        ))}
      </div>
    </article>
  );
}
