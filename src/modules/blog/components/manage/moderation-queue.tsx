"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, MessageSquare, X } from "lucide-react";
import {
  listModerationQueueAction,
  moderatePostAction,
} from "../../actions/post.actions";
import { listPendingCommentsAction, reviewCommentAction } from "../../actions/comment.actions";
import { useToast } from "@/components/feedback/toast";
import { formatDateTime, truncate } from "../../lib/format";
import type { PendingCommentDTO, PostDetailDTO } from "../../types";

/**
 * 审核队列（M10 / PRD §六）：文章 + 评论两个待审池。
 *
 * 复核动作的可见反馈：通过/驳回后立即从列表移除（乐观收缩）+ Toast；
 * 驳回必须填审核意见（≤300 字），作者在"我的文章"里能看到驳回原因。
 */
export function ModerationQueue() {
  const toast = useToast();
  const [tab, setTab] = useState<"post" | "comment">("post");
  const [posts, setPosts] = useState<PostDetailDTO[]>([]);
  const [comments, setComments] = useState<PendingCommentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ kind: "post" | "comment"; id: string } | null>(null);
  const [note, setNote] = useState("");

  const reload = useCallback(async (which: "post" | "comment") => {
    setLoading(true);
    if (which === "post") {
      const res = await listModerationQueueAction();
      setLoading(false);
      if (res.success) setPosts(res.data);
      return;
    }
    const res = await listPendingCommentsAction();
    setLoading(false);
    if (res.success) setComments(res.data);
  }, []);

  useEffect(() => {
    void reload(tab);
  }, [tab, reload]);

  async function moderate(id: string, action: "APPROVE" | "REJECT", reviewNote?: string) {
    if (busyId) return;
    setBusyId(id);
    const res = await moderatePostAction({ id, action, note: reviewNote });
    setBusyId(null);
    if (!res.success) {
      toast.error(res.error.message || "操作失败");
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== id));
    toast.success(action === "APPROVE" ? "已通过并公开" : "已驳回（作者可见审核意见）");
  }

  async function reviewComment(id: string, action: "APPROVE" | "REJECT", reviewNote?: string) {
    if (busyId) return;
    setBusyId(id);
    const res = await reviewCommentAction({ id, action, note: reviewNote });
    setBusyId(null);
    if (!res.success) {
      toast.error(res.error.message || "操作失败");
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== id));
    toast.success(action === "APPROVE" ? "评论已通过并公开" : "评论已驳回");
  }

  function openReject(kind: "post" | "comment", id: string) {
    setNote("");
    setRejectTarget({ kind, id });
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    if (!note.trim()) {
      toast.error("请填写审核意见（作者会看到）");
      return;
    }
    const { kind, id } = rejectTarget;
    setRejectTarget(null);
    if (kind === "post") await moderate(id, "REJECT", note.trim());
    else await reviewComment(id, "REJECT", note.trim());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b" style={{ borderColor: "var(--color-border)" }} role="tablist" aria-label="审核对象">
        {(
          [
            { key: "post", label: `待审文章（${posts.length}）` },
            { key: "comment", label: `待审评论（${comments.length}）` },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className="relative -mb-px px-3 py-2 text-sm transition-colors"
            style={{ color: tab === t.key ? "var(--color-primary)" : "var(--color-text-secondary)" }}
          >
            {t.label}
            {tab === t.key && (
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5" style={{ backgroundColor: "var(--color-primary)" }} />
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 py-8 text-sm" style={{ color: "var(--color-text-muted)" }}>
          <Loader2 size={14} className="animate-spin" aria-hidden />
          正在加载队列…
        </p>
      ) : tab === "post" ? (
        posts.length === 0 ? (
          <EmptyHint text="没有待审核的文章。" />
        ) : (
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id} className="rounded-[var(--radius-lg)] border p-4" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold">{p.title}</p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {p.author.displayName ?? p.author.username} · {formatDateTime(p.updatedAt)}
                      {p.auditNote && <span style={{ color: "var(--color-warning)" }}> · 机审提示：{p.auditNote}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={busyId === p.id}
                      onClick={() => void moderate(p.id, "APPROVE")}
                    >
                      <Check size={13} aria-hidden />
                      通过
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busyId === p.id}
                      onClick={() => openReject("post", p.id)}
                    >
                      <X size={13} aria-hidden />
                      驳回
                    </button>
                  </div>
                </div>
                {p.excerpt && (
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                    {truncate(p.excerpt, 160)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )
      ) : comments.length === 0 ? (
        <EmptyHint text="没有待审核的评论。" />
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-[var(--radius-lg)] border p-4" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">
                    {c.author.displayName ?? c.author.username}
                    <span className="ml-2 text-xs font-normal" style={{ color: "var(--color-text-muted)" }}>
                      评论于
                      <Link href={`/blog/p/${c.post.slug}`} className="mx-1 underline underline-offset-2" style={{ color: "var(--color-primary)" }}>
                        {truncate(c.post.title, 24)}
                      </Link>
                      {formatDateTime(c.createdAt)}
                    </span>
                  </p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                    {truncate(c.content, 200)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busyId === c.id}
                    onClick={() => void reviewComment(c.id, "APPROVE")}
                  >
                    <MessageSquare size={13} aria-hidden />
                    通过
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={busyId === c.id}
                    onClick={() => openReject("comment", c.id)}
                  >
                    <X size={13} aria-hidden />
                    驳回
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 驳回意见对话框（轻量内联：不引入 Modal 依赖层级） */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          role="dialog"
          aria-modal="true"
          aria-label="填写审核意见"
        >
          <div className="w-full max-w-md rounded-[var(--radius-lg)] border p-5" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-surface)" }}>
            <h3 className="text-base font-semibold">驳回原因（作者可见）</h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 300))}
              rows={3}
              autoFocus
              className="mt-3 w-full resize-none rounded-[var(--radius)] border p-3 text-sm"
              style={{ borderColor: "var(--color-border)" }}
              placeholder="例如：包含广告链接 / 涉及敏感内容，修改后可重新提交…"
            />
            <p className="mt-1 text-right text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
              {note.length} / 300
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRejectTarget(null)}>
                取消
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => void confirmReject()}>
                确认驳回
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="rounded-[var(--radius)] border border-dashed px-4 py-10 text-center text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
      {text}
    </p>
  );
}
