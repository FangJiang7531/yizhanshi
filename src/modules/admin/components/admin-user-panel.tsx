"use client";

import { useState } from "react";
import { BadgeCheck, Ban, Loader2, RotateCcw, SendHorizontal, Trash2 } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  adminRemoveBadgeAction,
  adminSendSystemMessageAction,
  adminSetBadgeAction,
  adminSetBannedAction,
} from "../actions/admin.actions";

type UserDetail = {
  id: string;
  username: string;
  email: string;
  emailVerifiedAt: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  role: string;
  status: string;
  timezone: string;
  lastLoginAt: string | null;
  createdAt: string;
  badge: { text: string; color: string; bgColor: string | null; enabled: boolean } | null;
  counts: Record<string, number>;
};

/** 用户详情面板：资料卡片 + 称号编辑器 + 封禁/解封 + 系统私信 */
export function AdminUserPanel({ user }: { user: UserDetail }) {
  const toast = useToast();
  const [banned, setBanned] = useState(user.status === "SUSPENDED");
  const [confirmBan, setConfirmBan] = useState(false);
  const [busy, setBusy] = useState(false);

  // 称号编辑
  const [text, setText] = useState(user.badge?.text ?? "认证用户");
  const [color, setColor] = useState(user.badge?.color ?? "#7d8cff");
  const [bgColor, setBgColor] = useState(user.badge?.bgColor ?? "");
  const [enabled, setEnabled] = useState(user.badge?.enabled ?? true);

  // 系统私信
  const [msgTitle, setMsgTitle] = useState("");
  const [msgContent, setMsgContent] = useState("");

  async function saveBadge() {
    if (busy) return;
    setBusy(true);
    const res = await adminSetBadgeAction({
      userId: user.id,
      text: text.trim(),
      color,
      bgColor: bgColor.trim() || null,
      enabled,
    });
    setBusy(false);
    toast(res.success ? "success" : "error", res.success ? "称号已保存" : res.error.message);
  }

  async function removeBadge() {
    const res = await adminRemoveBadgeAction({ userId: user.id });
    if (res.success) {
      toast("success", "已移除称号");
      setEnabled(false);
    } else {
      toast("error", res.error.message);
    }
  }

  async function toggleBan(next: boolean) {
    setConfirmBan(false);
    const res = await adminSetBannedAction({ userId: user.id, banned: next });
    if (res.success) {
      setBanned(next);
      toast("success", next ? "已封禁并吊销全部会话" : "已解封");
    } else {
      toast("error", res.error.message);
    }
  }

  async function sendMessage() {
    if (busy || !msgTitle.trim() || !msgContent.trim()) return;
    setBusy(true);
    const res = await adminSendSystemMessageAction({
      userId: user.id,
      title: msgTitle.trim(),
      content: msgContent.trim(),
    });
    setBusy(false);
    if (res.success) {
      toast("success", "系统私信已发送（对方私信页「系统信息」栏可见）");
      setMsgTitle("");
      setMsgContent("");
    } else {
      toast("error", res.error.message);
    }
  }

  const info: [string, string][] = [
    ["邮箱", `${user.email}${user.emailVerifiedAt ? "（已验证）" : "（未验证）"}`],
    ["角色", user.role],
    ["状态", banned ? "封禁中" : "正常"],
    ["时区", user.timezone],
    ["注册时间", new Date(user.createdAt).toLocaleString("zh-CN")],
    ["最后登录", user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("zh-CN") : "从未"],
    ["简介", user.bio ?? "—"],
    ["统计", `文章 ${user.counts.posts ?? 0} · 评论 ${user.counts.comments ?? 0} · 粉丝 ${user.counts.followers ?? 0} · 关注 ${user.counts.following ?? 0} · 短链 ${user.counts.shortLinks ?? 0} · 书签 ${user.counts.bookmarks ?? 0}`],
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* 资料 + 封禁 */}
      <section className="rounded-[var(--radius)] p-5" style={{ backgroundColor: "rgba(22,30,66,0.7)", border: "1px solid rgba(125,140,255,0.14)" }}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><BadgeCheck size={15} style={{ color: "#7d8cff" }} aria-hidden /> 资料与状态</h2>
        <dl className="space-y-1.5 text-[13px]">
          {info.map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <dt className="w-20 shrink-0" style={{ color: "#8a92b8" }}>{k}</dt>
              <dd className="min-w-0 break-words" style={{ color: "#dfe4ff" }}>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex gap-2">
          {banned ? (
            <button type="button" className="btn btn-outline btn-sm !border-white/20 !text-white/85" onClick={() => void toggleBan(false)}>
              <RotateCcw size={13} aria-hidden /> 解封账号
            </button>
          ) : (
            <button type="button" className="btn btn-sm" style={{ backgroundColor: "rgba(216,67,79,0.16)", color: "#ff9aa2", border: "1px solid rgba(255,123,133,0.35)" }} onClick={() => setConfirmBan(true)}>
              <Ban size={13} aria-hidden /> 封禁账号
            </button>
          )}
        </div>
      </section>

      {/* 称号编辑 */}
      <section className="rounded-[var(--radius)] p-5" style={{ backgroundColor: "rgba(22,30,66,0.7)", border: "1px solid rgba(125,140,255,0.14)" }}>
        <h2 className="mb-3 text-sm font-semibold">称号认证</h2>
        <div className="space-y-3 text-[13px]">
          <label className="flex items-center gap-3">
            <span className="w-16 shrink-0" style={{ color: "#8a92b8" }}>文字</span>
            <input className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} maxLength={20} aria-label="称号文字" style={{ color: "#e9ecff" }} />
          </label>
          <label className="flex items-center gap-3">
            <span className="w-16 shrink-0" style={{ color: "#8a92b8" }}>文字色</span>
            <input type="color" className="h-9 w-14 cursor-pointer rounded border-0 bg-transparent" value={color} onChange={(e) => setColor(e.target.value)} aria-label="文字颜色" />
            <span className="tabular-nums" style={{ color: "#5f6a96" }}>{color}</span>
          </label>
          <label className="flex items-center gap-3">
            <span className="w-16 shrink-0" style={{ color: "#8a92b8" }}>背景色</span>
            <input type="color" className="h-9 w-14 cursor-pointer rounded border-0 bg-transparent" value={bgColor || "#16224d"} onChange={(e) => setBgColor(e.target.value)} aria-label="背景颜色" />
            <button type="button" className="btn btn-ghost btn-sm !text-xs" style={{ color: "#8a92b8" }} onClick={() => setBgColor("")}>透明</button>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} aria-label="启用称号" />
            <span style={{ color: "#aab2e0" }}>启用（展示于昵称后与头像 S 角标）</span>
          </label>

          <div className="rounded-[var(--radius-sm)] p-3" style={{ backgroundColor: "rgba(10,15,36,0.8)" }}>
            <p className="text-[11px]" style={{ color: "#8a92b8" }}>预览（评论区效果）</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm" style={{ color: "#dfe4ff" }}>
              {user.displayName ?? user.username}
              <span className="inline-block rounded px-1.5 py-px text-[11px] font-semibold leading-4" style={{ color, border: `1px solid ${color}`, backgroundColor: bgColor || "transparent" }}>
                {text || "称号"}
              </span>
            </p>
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !text.trim()} onClick={() => void saveBadge()}>
              {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
              保存称号
            </button>
            <button type="button" className="btn btn-outline btn-sm !border-white/20 !text-white/85" onClick={() => void removeBadge()}>
              <Trash2 size={13} aria-hidden /> 移除
            </button>
          </div>
        </div>
      </section>

      {/* 系统私信 */}
      <section className="rounded-[var(--radius)] p-5 lg:col-span-2" style={{ backgroundColor: "rgba(22,30,66,0.7)", border: "1px solid rgba(125,140,255,0.14)" }}>
        <h2 className="mb-1 text-sm font-semibold">发送系统私信</h2>
        <p className="mb-3 text-[11px]" style={{ color: "#8a92b8" }}>对方将在私信页「系统信息」栏收到，带官方标识。</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[240px_1fr]">
          <input className="input" placeholder="标题（如：账号安全提醒）" value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} maxLength={200} aria-label="私信标题" style={{ color: "#e9ecff" }} />
          <textarea className="input min-h-[72px]" placeholder="正文内容…" value={msgContent} onChange={(e) => setMsgContent(e.target.value)} maxLength={2000} aria-label="私信内容" style={{ color: "#e9ecff" }} />
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !msgTitle.trim() || !msgContent.trim()} onClick={() => void sendMessage()}>
            <SendHorizontal size={13} aria-hidden />
            发送给 @{user.username}
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmBan}
        title={`封禁 @${user.username}？`}
        message="封禁后立即踢出登录并吊销全部会话，无法登录使用。"
        confirmText="确认封禁"
        danger
        onCancel={() => setConfirmBan(false)}
        onConfirm={() => void toggleBan(true)}
      />
    </div>
  );
}
