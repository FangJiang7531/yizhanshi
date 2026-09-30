"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Code, Italic, Link2, Loader2, MessageSquare, Reply, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  createCommentAction,
  deleteCommentAction,
  listCommentsAction,
} from "../../actions/comment.actions";
import { toggleCommentLikeAction } from "../../actions/interaction.actions";
import { useCommentStream } from "../../hooks/use-comment-stream";
import { AuthorAvatar } from "../post-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import { formatDateTime } from "../../lib/format";
import type { CommentDTO } from "../../types";

/**
 * 评论区（PRD §5.6）：两级评论 + 排序切换 + 轻量 Markdown 编辑器
 * + 字数实时计数 + SSE 实时推送（新评论 2 秒内到达）+ 删除占位 + 评论点赞。
 *
 * 架构约束（Gate 5.2）：详情页是 ISR 缓存，评论区整体客户端加载——
 * 服务端输出不含任何评论/身份内容，挂载后经 Action 拉取。
 */

const MAX_LEN = 2000;
const MIN_LEN = 1;

/** 轻量 Markdown：加粗/斜体/行内代码/链接（PRD §5.6 编辑器规格） */
type Tool = "bold" | "italic" | "code" | "link";
const WRAP: Record<Tool, { before: string; after: string; placeholder: string }> = {
  bold: { before: "**", after: "**", placeholder: "加粗文字" },
  italic: { before: "*", after: "*", placeholder: "斜体文字" },
  code: { before: "`", after: "`", placeholder: "代码" },
  link: { before: "[", after: "](https://)", placeholder: "链接文字" },
};

export function CommentSection({
  postId,
  allowComment,
  initialTotal,
}: {
  postId: string;
  allowComment: boolean;
  initialTotal: number;
}) {
  const toast = useToast();
  const [items, setItems] = useState<CommentDTO[]>([]);
  const [total, setTotal] = useState(initialTotal);
  const [cursor, setCursor] = useState<string | null>(null);
  const [sort, setSort] = useState<"new" | "hot">("new");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<CommentDTO | null>(null);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const load = useCallback(async (s: "new" | "hot") => {
    setLoading(true);
    const res = await listCommentsAction({ postId, sort: s, take: 20 });
    setLoading(false);
    if (!res.success) return;
    setItems(res.data.items);
    setTotal(res.data.total);
    setCursor(res.data.nextCursor);
  }, [postId]);

  // 登录态（决定表单/引导）+ 首屏列表
  useEffect(() => {
    void (async () => {
      const { getViewerIdentityAction } = await import("../../actions/post.actions");
      const identity = await getViewerIdentityAction();
      if (identity.success) setLoggedIn(identity.data.userId !== null);
    })();
  }, [postId]);

  useEffect(() => {
    void load(sort);
  }, [sort, load]);

  async function loadMore() {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    const res = await listCommentsAction({ postId, sort, cursor, take: 20 });
    setLoadingMore(false);
    if (!res.success) return;
    setItems((prev) => {
      const seen = new Set(prev.map((c) => c.id));
      return [...prev, ...res.data.items.filter((c) => !seen.has(c.id))];
    });
    setCursor(res.data.nextCursor);
  }

  // SSE：新评论实时插入（服务端从连接时刻起推送；按 id 去重保证幂等）。
  // 归属判定依赖 DTO 的 parentId：null → 顶层，非 null → 挂到对应楼层的回复列表尾部。
  const onComments = useCallback(
    (incoming: CommentDTO[]) => {
      setItems((prev) => {
        const exists = (id: string) =>
          prev.some((c) => c.id === id || c.replies.some((r) => r.id === id));
        let next = prev;
        let added = 0;
        for (const c of incoming) {
          if (exists(c.id)) continue;
          if (c.parentId === null) {
            // 顶层：仅"最新"排序实时插入（最热排序的插入位置无意义，切排序时自然刷新）
            if (sortRef.current === "new") {
              next = [c, ...next];
              added += 1;
            }
          } else {
            next = next.map((top) =>
              top.id === c.parentId ? { ...top, replies: [...top.replies, c] } : top,
            );
            added += 1;
          }
        }
        if (added > 0) setTotal((t) => t + added);
        if (incoming.length > 0) setEnteringId(incoming[0]!.id);
        return next;
      });
    },
    [],
  );

  const { connected } = useCommentStream(postId, onComments, true);

  // ── 编辑器工具 ──
  function wrapSelection(tool: Tool) {
    const el = textareaRef.current;
    if (!el) return;
    const { before, after, placeholder } = WRAP[tool];
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = draft.slice(start, end) || placeholder;
    const next = `${draft.slice(0, start)}${before}${selected}${after}${draft.slice(end)}`;
    setDraft(next.slice(0, MAX_LEN));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  async function submit() {
    const content = draft.trim();
    if (content.length < MIN_LEN || content.length > MAX_LEN || submitting) return;
    setSubmitting(true);
    const res = await createCommentAction({ postId, parentId: replyTo?.id, content });
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error.message || "评论失败，请重试");
      return;
    }
    const created = res.data;
    setDraft("");
    setReplyTo(null);
    if (created.status === "PENDING") {
      toast.success("评论已提交，审核通过后展示");
      return;
    }
    // 插入 + 展开动画 + 滚动到该评论（PRD §5.6）
    setItems((prev) => (replyToList(prev, created, replyTo?.id ?? null)));
    setTotal((t) => t + 1);
    setEnteringId(created.id);
    requestAnimationFrame(() => {
      document.getElementById(`comment-${created.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function remove() {
    if (!confirmDelete) return;
    const res = await deleteCommentAction({ commentId: confirmDelete });
    setConfirmDelete(null);
    if (!res.success) {
      toast.error(res.error.message || "删除失败");
      return;
    }
    // 级联删除（顶层带回复）后楼层数变化——全量刷新当前视图保证一致
    void load(sort);
    toast.success("评论已删除");
  }

  async function like(commentId: string) {
    const res = await toggleCommentLikeAction({ commentId });
    if (!res.success) return;
    setItems((prev) =>
      prev.map((top) => {
        if (top.id === commentId) return { ...top, liked: res.data.liked, likeCount: res.data.likeCount };
        const replies = top.replies.map((r) =>
          r.id === commentId ? { ...r, liked: res.data.liked, likeCount: res.data.likeCount } : r,
        );
        return replies === top.replies ? top : { ...top, replies };
      }),
    );
  }

  const draftLen = draft.trim().length;

  return (
    <section id="comments" className="mt-10 border-t pt-6" ref={listRef} style={{ borderColor: "var(--color-border)" }}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">评论 <span className="text-sm font-normal" style={{ color: "var(--color-text-muted)" }}>({total})</span></h2>
        {connected && (
          <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--color-success)" }} title="实时连接已建立">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--color-success)" }} aria-hidden />
            实时
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 text-xs" role="tablist" aria-label="评论排序">
          {(["new", "hot"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={sort === s}
              onClick={() => setSort(s)}
              className="rounded px-2 py-1 transition-colors"
              style={{
                color: sort === s ? "var(--color-primary)" : "var(--color-text-muted)",
                backgroundColor: sort === s ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "transparent",
              }}
            >
              {s === "new" ? "最新" : "最热"}
            </button>
          ))}
        </div>
      </div>

      {/* 编辑器（allowComment=false 时隐藏并提示，A-13） */}
      {allowComment ? (
        loggedIn ? (
          <div className="mb-6">
            {replyTo && (
              <p className="mb-1.5 flex items-center gap-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                回复 <b style={{ color: "var(--color-text-secondary)" }}>{replyTo.author.displayName ?? replyTo.author.username}</b>
                <button type="button" className="underline underline-offset-2" onClick={() => setReplyTo(null)}>
                  取消
                </button>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1 border-b pb-1.5" style={{ borderColor: "var(--color-border)" }}>
              {(Object.keys(WRAP) as Tool[]).map((t) => {
                const Icon = t === "bold" ? Bold : t === "italic" ? Italic : t === "code" ? Code : Link2;
                const label = { bold: "加粗", italic: "斜体", code: "行内代码", link: "链接" }[t];
                return (
                  <button
                    key={t}
                    type="button"
                    className="editor-tool-btn"
                    onClick={() => wrapSelection(t)}
                    aria-label={label}
                    title={label}
                  >
                    <Icon size={13} aria-hidden />
                  </button>
                );
              })}
              <span className="ml-auto text-[11px] tabular-nums" style={{ color: draftLen > MAX_LEN ? "var(--color-danger)" : "var(--color-text-muted)" }}>
                {draft.length} / {MAX_LEN}
              </span>
            </div>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
              rows={3}
              placeholder={replyTo ? `回复 @${replyTo.author.displayName ?? replyTo.author.username}…` : "写下你的评论…（支持轻量 Markdown）"}
              className="mt-2 w-full resize-y rounded-[var(--radius)] border p-3 text-sm leading-relaxed"
              style={{ borderColor: "var(--color-border)" }}
              aria-label="评论内容"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={submitting || draftLen < MIN_LEN || draftLen > MAX_LEN}
                onClick={() => void submit()}
              >
                {submitting ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <MessageSquare size={13} aria-hidden />}
                {submitting ? "发布中…" : "发布评论"}
              </button>
            </div>
          </div>
        ) : (
          <p className="mb-6 rounded-[var(--radius)] border border-dashed px-4 py-3 text-center text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
            <Link href="/login" className="underline underline-offset-2" style={{ color: "var(--color-primary)" }}>
              登录
            </Link>
            后参与评论。
          </p>
        )
      ) : (
        <p className="mb-6 rounded-[var(--radius)] border border-dashed px-4 py-3 text-center text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
          作者已关闭评论。
        </p>
      )}

      {/* 列表 */}
      {loading ? (
        <p className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--color-text-muted)" }}>
          <Loader2 size={14} className="animate-spin" aria-hidden />
          正在加载评论…
        </p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
          还没有评论，来说点什么吧。
        </p>
      ) : (
        <div className="space-y-0">
          {items.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              entering={enteringId === c.id}
              onReply={() => setReplyTo(c)}
              onLike={() => void like(c.id)}
              onDelete={() => setConfirmDelete(c.id)}
            />
          ))}
        </div>
      )}

      {cursor && !loading && (
        <div className="flex justify-center pt-3">
          <button type="button" className="btn btn-ghost btn-sm" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
            加载更多
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="删除这条评论？"
        message="删除后将显示“该评论已删除”占位（保留楼层）；顶层评论的回复会一并删除。"
        confirmText="删除"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void remove()}
      />
    </section>
  );
}

/** 插入新评论：顶层 unshift，或作为回复挂到父级尾部 */
function replyToList(prev: CommentDTO[], created: CommentDTO, parentId: string | null): CommentDTO[] {
  if (!parentId) return [created, ...prev];
  return prev.map((top) =>
    top.id === parentId ? { ...top, replies: [...top.replies, created] } : top,
  );
}

function CommentItem({
  comment,
  entering,
  onReply,
  onLike,
  onDelete,
}: {
  comment: CommentDTO;
  entering: boolean;
  onReply: () => void;
  onLike: () => void;
  onDelete: () => void;
}) {
  return (
    <article id={`comment-${comment.id}`} className={`border-b py-4 last:border-b-0 ${entering ? "comment-enter" : ""}`} style={{ borderColor: "var(--color-border)" }}>
      <div className="flex items-start gap-3">
        <AuthorAvatar author={comment.author} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[13px] font-medium">{comment.author.displayName ?? comment.author.username}</span>
            <time dateTime={comment.createdAt} className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              {formatDateTime(comment.createdAt)}
            </time>
          </div>

          <div className="mt-1 text-sm leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
            {comment.deleted ? (
              <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>该评论已删除。</span>
            ) : (
              <span dangerouslySetInnerHTML={{ __html: comment.contentHtml }} />
            )}
          </div>

          {!comment.deleted && (
            <div className="mt-1.5 flex items-center gap-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
              <button
                type="button"
                onClick={onLike}
                aria-pressed={comment.liked}
                className="flex items-center gap-1 transition-colors hover:text-[var(--color-primary)]"
                style={{ color: comment.liked ? "var(--color-primary)" : undefined }}
              >
                <Heart liked={comment.liked} />
                {comment.likeCount > 0 && <span className="tabular-nums">{comment.likeCount}</span>}
              </button>
              <button type="button" onClick={onReply} className="flex items-center gap-1 transition-colors hover:text-[var(--color-primary)]">
                <Reply size={12} aria-hidden />
                回复
              </button>
              {comment.canDelete && (
                <button type="button" onClick={onDelete} className="flex items-center gap-1 transition-colors hover:text-[var(--color-danger)]">
                  <Trash2 size={12} aria-hidden />
                  删除
                </button>
              )}
            </div>
          )}

          {/* 回复列表（两级：回复的回复已在服务端上提为顶层，PRD §5.6） */}
          {comment.replies.length > 0 && (
            <div className="mt-3 space-y-3 border-l-2 pl-3" style={{ borderColor: "var(--color-border)" }}>
              {comment.replies.map((r) => (
                <CommentItem key={r.id} comment={r} entering={false} onReply={onReply} onLike={onLike} onDelete={onDelete} />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function Heart({ liked }: { liked: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}
