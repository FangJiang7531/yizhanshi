"use client";

import { useState } from "react";
import { Loader2, Megaphone, Search, SendHorizontal } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { adminBroadcastAction, adminListUsersAction, adminSendSystemMessageAction } from "../actions/admin.actions";
import type { AdminUserRow } from "../services/admin.service";

/** 系统私信：搜索用户单发，或全员广播 */
export function AdminMessages() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmBroadcast, setConfirmBroadcast] = useState(false);

  async function search() {
    if (!q.trim()) return;
    const res = await adminListUsersAction({ q: q.trim() });
    if (res.success) setUsers(res.data);
  }

  async function sendTo() {
    if (!selected || busy) return;
    setBusy(true);
    const res = await adminSendSystemMessageAction({ userId: selected.id, title: title.trim(), content: content.trim() });
    setBusy(false);
    if (res.success) {
      toast("success", `已发送给 @${selected.username}`);
      setTitle("");
      setContent("");
      setSelected(null);
    } else {
      toast("error", res.error.message);
    }
  }

  async function broadcast() {
    setConfirmBroadcast(false);
    setBusy(true);
    const res = await adminBroadcastAction({ title: title.trim(), content: content.trim() });
    setBusy(false);
    if (res.success) {
      toast("success", `广播已发送给 ${res.data.sent} 位用户`);
      setTitle("");
      setContent("");
    } else {
      toast("error", res.error.message);
    }
  }

  const card = { backgroundColor: "rgba(22,30,66,0.7)", border: "1px solid rgba(125,140,255,0.14)" } as const;

  return (
    <div className="space-y-4">
      {/* 收件人 */}
      <section className="rounded-[var(--radius)] p-4" style={card}>
        <h2 className="mb-2 text-sm font-semibold">收件人</h2>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" aria-hidden />
            <input
              className="input pl-9"
              placeholder="搜索用户（用户名/邮箱/昵称）"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void search()}
              aria-label="搜索收件人"
              style={{ color: "#e9ecff" }}
            />
          </div>
          <button type="button" className="btn btn-outline btn-sm !border-white/20 !text-white/85" onClick={() => void search()}>搜索</button>
        </div>
        {selected ? (
          <p className="mt-2 text-[13px]" style={{ color: "#86efac" }}>✓ 收件人：{selected.displayName ?? selected.username}（@{selected.username}）</p>
        ) : users.length > 0 ? (
          <ul className="mt-2 max-h-44 space-y-0.5 overflow-y-auto">
            {users.map((u) => (
              <li key={u.id}>
                <button type="button" className="w-full rounded px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-white/5" style={{ color: "#dfe4ff" }} onClick={() => setSelected(u)}>
                  {u.displayName ?? u.username} <span className="text-[11px]" style={{ color: "#5f6a96" }}>@{u.username}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* 内容 */}
      <section className="rounded-[var(--radius)] p-4" style={card}>
        <h2 className="mb-2 text-sm font-semibold">消息内容</h2>
        <input className="input mb-2" placeholder="标题" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="标题" style={{ color: "#e9ecff" }} />
        <textarea className="input min-h-[100px]" placeholder="正文…" value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} aria-label="正文" style={{ color: "#e9ecff" }} />
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-outline btn-sm !border-white/20 !text-white/85" disabled={!title.trim() || !content.trim() || busy} onClick={() => setConfirmBroadcast(true)}>
            <Megaphone size={13} aria-hidden /> 广播全员
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!selected || !title.trim() || !content.trim() || busy} onClick={() => void sendTo()}>
            {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <SendHorizontal size={13} aria-hidden />}
            发送给指定用户
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmBroadcast}
        title="向全部用户广播？"
        message={`将向所有正常状态用户发送系统私信《${title}》。`}
        confirmText="确认广播"
        danger
        onCancel={() => setConfirmBroadcast(false)}
        onConfirm={() => void broadcast()}
      />
    </div>
  );
}
