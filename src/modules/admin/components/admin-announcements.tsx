"use client";

import { useState } from "react";
import { Loader2, Megaphone, Plus, Trash2, X } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  adminDeleteAnnouncementAction,
  adminSaveAnnouncementAction,
  adminToggleAnnouncementAction,
} from "../actions/admin.actions";

type Row = {
  id: string;
  title: string;
  content: string;
  level: "info" | "warning" | "critical";
  active: boolean;
  createdAt: string;
};

const LEVEL_LABEL = { info: "通知", warning: "重要", critical: "紧急" } as const;
const LEVEL_COLOR = { info: "#5eb0ff", warning: "#fbbf24", critical: "#ff7b85" } as const;

/** 公告管理：新建/编辑/启停/删除弹窗公告 */
export function AdminAnnouncements({ initial }: { initial: Row[] }) {
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [level, setLevel] = useState<"info" | "warning" | "critical">("info");
  const [active, setActive] = useState(true);

  function openNew() {
    setEditing("new");
    setTitle("");
    setContent("");
    setLevel("info");
    setActive(true);
  }

  function openEdit(r: Row) {
    setEditing(r);
    setTitle(r.title);
    setContent(r.content);
    setLevel(r.level);
    setActive(r.active);
  }

  async function save() {
    if (busy || !title.trim() || !content.trim()) return;
    setBusy(true);
    const res = await adminSaveAnnouncementAction({
      id: editing && editing !== "new" ? editing.id : undefined,
      title: title.trim(),
      content: content.trim(),
      level,
      active,
    });
    setBusy(false);
    if (!res.success) {
      toast("error", res.error.message);
      return;
    }
    toast("success", "公告已保存");
    setEditing(null);
    // 刷新本地列表（简化：重新载入由下次进入页面；此处本地合成）
    setRows((prev) => {
      const others = prev.filter((r) => r.id !== res.data.id);
      return [
        { id: res.data.id, title: title.trim(), content: content.trim(), level, active, createdAt: new Date().toISOString() },
        ...others,
      ];
    });
  }

  async function toggle(r: Row, next: boolean) {
    const res = await adminToggleAnnouncementAction({ id: r.id, active: next });
    if (res.success) {
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: next } : x)));
    } else {
      toast("error", res.error.message);
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    const res = await adminDeleteAnnouncementAction({ id: confirmDelete.id });
    setConfirmDelete(null);
    if (res.success) {
      setRows((prev) => prev.filter((x) => x.id !== confirmDelete.id));
      toast("success", "公告已删除");
    } else {
      toast("error", res.error.message);
    }
  }

  const card = { backgroundColor: "rgba(22,30,66,0.7)", border: "1px solid rgba(125,140,255,0.14)" } as const;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>
          <Plus size={14} aria-hidden /> 新建公告
        </button>
      </div>

      {editing !== null && (
        <section className="rounded-[var(--radius)] p-4" style={card}>
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{editing === "new" ? "新建公告" : "编辑公告"}</h2>
            <button type="button" className="icon-btn !text-white/60" onClick={() => setEditing(null)} aria-label="取消编辑"><X size={15} /></button>
          </header>
          <div className="space-y-3">
            <input className="input" placeholder="标题" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="公告标题" style={{ color: "#e9ecff" }} />
            <textarea className="input min-h-[96px]" placeholder="正文（用户弹窗中将完整展示）" value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} aria-label="公告内容" style={{ color: "#e9ecff" }} />
            <div className="flex flex-wrap items-center gap-4 text-[13px]">
              <span className="flex items-center gap-2" style={{ color: "#aab2e0" }}>
                级别：
                {(["info", "warning", "critical"] as const).map((l) => (
                  <button key={l} type="button" onClick={() => setLevel(l)}
                    className="rounded-full px-2.5 py-0.5 text-xs transition-colors"
                    style={{ border: `1px solid ${level === l ? LEVEL_COLOR[l] : "rgba(125,140,255,0.25)"}`, color: level === l ? LEVEL_COLOR[l] : "#8a92b8" }}>
                    {LEVEL_LABEL[l]}
                  </button>
                ))}
              </span>
              <label className="flex items-center gap-2" style={{ color: "#aab2e0" }}>
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                立即生效
              </label>
              <button type="button" className="btn btn-primary btn-sm ml-auto" disabled={busy || !title.trim() || !content.trim()} onClick={() => void save()}>
                {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
                保存公告
              </button>
            </div>
          </div>
        </section>
      )}

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm" style={{ color: "#8a92b8" }}>暂无公告</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-[var(--radius)] p-4" style={card}>
              <div className="flex flex-wrap items-center gap-2">
                <Megaphone size={14} style={{ color: LEVEL_COLOR[r.level] }} aria-hidden />
                <span className="text-sm font-medium" style={{ color: "#dfe4ff" }}>{r.title}</span>
                <span className="rounded px-1.5 py-px text-[10px]" style={{ border: `1px solid ${LEVEL_COLOR[r.level]}`, color: LEVEL_COLOR[r.level] }}>{LEVEL_LABEL[r.level]}</span>
                <span className="text-[11px]" style={{ color: "#5f6a96" }}>{new Date(r.createdAt).toLocaleString("zh-CN")}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.active}
                    aria-label={r.active ? "停用公告" : "启用公告"}
                    className="relative h-6 w-11 rounded-full transition-colors"
                    style={{ backgroundColor: r.active ? "rgba(125,140,255,0.85)" : "rgba(95,106,150,0.4)" }}
                    onClick={() => void toggle(r, !r.active)}
                  >
                    <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: r.active ? "20px" : "2px" }} />
                  </button>
                  <button type="button" className="btn btn-outline btn-sm !border-white/20 !text-white/85" onClick={() => openEdit(r)}>编辑</button>
                  <button type="button" className="btn btn-sm" style={{ backgroundColor: "rgba(216,67,79,0.14)", color: "#ff9aa2", border: "1px solid rgba(255,123,133,0.3)" }} onClick={() => setConfirmDelete(r)}>
                    <Trash2 size={12} aria-hidden />
                  </button>
                </span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[13px]" style={{ color: "#aab2e0" }}>{r.content}</p>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="删除该公告？"
        message="删除后用户端不再弹出，操作不可撤销。"
        confirmText="删除"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
