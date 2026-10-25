"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, EyeOff, FileText, Loader2, MessageSquare, ShieldAlert, XCircle } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import {
  adminDismissBlockedAction,
  adminListBlockedAction,
  adminModerateAction,
  adminPendingCommentsAction,
  adminPendingPostsAction,
} from "../actions/admin.actions";

type BlockedRow = {
  id: string;
  kind: string;
  content: string;
  matchedWords: unknown;
  status: string;
  createdAt: string;
  author: string;
};

type PendingPost = { id: string; title: string; author: { username: string; displayName: string | null }; updatedAt?: string; createdAt?: string; excerpt?: string | null; post?: { title: string } };
type PendingComment = { id: string; content: string; author: { username: string; displayName: string | null }; post: { title: string; slug: string }; createdAt: string };

/** 审核工作台：待审文章 / 待审评论 / 阻断记录（三个区块） */
export function AdminModeration({ initialBlocked }: { initialBlocked: BlockedRow[] }) {
  const toast = useToast();
  const [tab, setTab] = useState<"posts" | "comments" | "blocked">("posts");
  const [posts, setPosts] = useState<PendingPost[]>([]);
  const [comments, setComments] = useState<PendingComment[]>([]);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (which: "posts" | "comments" | "blocked" = tab) => {
    setLoading(true);
    if (which === "posts") {
      const res = await adminPendingPostsAction();
      if (res.success) setPosts(res.data as PendingPost[]);
    } else if (which === "comments") {
      const res = await adminPendingCommentsAction();
      if (res.success) setComments(res.data as PendingComment[]);
    } else {
      const res = await adminListBlockedAction({ status: "pending" });
      if (res.success) setBlocked(res.data as BlockedRow[]);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  async function moderate(kind: "post" | "comment", id: string, action: "approve" | "reject") {
    const res = await adminModerateAction({ kind, id, action });
    if (res.success) {
      toast("success", action === "approve" ? "已通过" : "已驳回");
      void load(kind === "post" ? "posts" : "comments");
    } else {
      toast("error", res.error.message);
    }
  }

  async function dismiss(id: string) {
    const res = await adminDismissBlockedAction({ id, action: "dismiss" });
    if (res.success) {
      setBlocked((prev) => prev.filter((b) => b.id !== id));
    } else {
      toast("error", res.error.message);
    }
  }

  const card = { backgroundColor: "rgba(22,30,66,0.7)", border: "1px solid rgba(125,140,255,0.14)" } as const;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-[var(--radius)] p-0.5" style={{ backgroundColor: "rgba(125,140,255,0.1)" }} role="tablist">
        {([["posts", "待审文章"], ["comments", "待审评论"], ["blocked", "阻断记录"]] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className="rounded-[var(--radius-sm)] px-3.5 py-1.5 text-xs transition-colors"
            style={{ backgroundColor: tab === key ? "rgba(125,140,255,0.25)" : "transparent", color: tab === key ? "#97a2ff" : "#8a92b8" }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin" style={{ color: "#7d8cff" }} aria-label="加载中" /></div>
      ) : tab === "posts" ? (
        posts.length === 0 ? <p className="py-10 text-center text-sm" style={{ color: "#8a92b8" }}>没有待审文章</p> : (
          <ul className="space-y-2">
            {posts.map((p) => (
              <li key={p.id} className="rounded-[var(--radius)] p-4" style={card}>
                <div className="flex flex-wrap items-center gap-2">
                  <FileText size={14} style={{ color: "#7d8cff" }} aria-hidden />
                  <span className="text-sm font-medium" style={{ color: "#dfe4ff" }}>{p.title || "无标题"}</span>
                  <span className="text-[11px]" style={{ color: "#5f6a96" }}>@{p.author.username}</span>
                  <span className="ml-auto flex gap-1.5">
                    <button type="button" className="btn btn-sm" style={{ backgroundColor: "rgba(74,222,128,0.14)", color: "#86efac", border: "1px solid rgba(74,222,128,0.3)" }} onClick={() => void moderate("post", p.id, "approve")}>
                      <CheckCircle2 size={12} aria-hidden /> 通过
                    </button>
                    <button type="button" className="btn btn-sm" style={{ backgroundColor: "rgba(216,67,79,0.14)", color: "#ff9aa2", border: "1px solid rgba(255,123,133,0.3)" }} onClick={() => void moderate("post", p.id, "reject")}>
                      <XCircle size={12} aria-hidden /> 驳回
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : tab === "comments" ? (
        comments.length === 0 ? <p className="py-10 text-center text-sm" style={{ color: "#8a92b8" }}>没有待审评论</p> : (
          <ul className="space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="rounded-[var(--radius)] p-4" style={card}>
                <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "#5f6a96" }}>
                  <MessageSquare size={13} style={{ color: "#7d8cff" }} aria-hidden />
                  @{c.author.username} · 文章《{c.post.title}》 · {new Date(c.createdAt).toLocaleString("zh-CN")}
                </div>
                <p className="mt-1.5 text-[13px]" style={{ color: "#dfe4ff" }}>{c.content}</p>
                <div className="mt-2 flex justify-end gap-1.5">
                  <button type="button" className="btn btn-sm" style={{ backgroundColor: "rgba(74,222,128,0.14)", color: "#86efac", border: "1px solid rgba(74,222,128,0.3)" }} onClick={() => void moderate("comment", c.id, "approve")}>
                    <CheckCircle2 size={12} aria-hidden /> 通过
                  </button>
                  <button type="button" className="btn btn-sm" style={{ backgroundColor: "rgba(216,67,79,0.14)", color: "#ff9aa2", border: "1px solid rgba(255,123,133,0.3)" }} onClick={() => void moderate("comment", c.id, "reject")}>
                    <XCircle size={12} aria-hidden /> 驳回
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        blocked.length === 0 ? <p className="py-10 text-center text-sm" style={{ color: "#8a92b8" }}>没有待处置的阻断记录</p> : (
          <ul className="space-y-2">
            {blocked.map((b) => (
              <li key={b.id} className="rounded-[var(--radius)] p-4" style={card}>
                <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "#5f6a96" }}>
                  <ShieldAlert size={13} style={{ color: "#fbbf24" }} aria-hidden />
                  {b.kind === "comment" ? "评论" : b.kind === "message" ? "私信" : "文章"} · @{b.author} · {new Date(b.createdAt).toLocaleString("zh-CN")}
                  <span className="ml-auto flex items-center gap-1.5">
                    {Array.isArray(b.matchedWords) && (b.matchedWords as string[]).length > 0 && (
                      <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
                        命中：{(b.matchedWords as string[]).join("、").slice(0, 40)}
                      </span>
                    )}
                    <button type="button" className="btn btn-outline btn-sm !border-white/20 !text-white/85" onClick={() => void dismiss(b.id)}>
                      <EyeOff size={12} aria-hidden /> 已阅处置
                    </button>
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px]" style={{ color: "#dfe4ff" }}>{b.content}</p>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
