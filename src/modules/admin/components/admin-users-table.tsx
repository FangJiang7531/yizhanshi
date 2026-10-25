"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Loader2, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { adminListUsersAction, adminSetBannedAction } from "../actions/admin.actions";
import type { AdminUserRow } from "../services/admin.service";

/** 用户列表（管理端）：搜索、状态筛选、快捷封禁/解封、进入详情 */
export function AdminUsersTable({ initialUsers }: { initialUsers: AdminUserRow[] }) {
  const toast = useToast();
  const [users, setUsers] = useState(initialUsers);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "SUSPENDED">("ALL");
  const [loading, setLoading] = useState(false);
  const [confirmBan, setConfirmBan] = useState<AdminUserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminListUsersAction({ q: q.trim() || undefined, status });
    setLoading(false);
    if (res.success) setUsers(res.data);
  }, [q, status]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  async function toggleBan(u: AdminUserRow, banned: boolean) {
    const res = await adminSetBannedAction({ userId: u.id, banned });
    setConfirmBan(null);
    if (res.success) {
      toast("success", banned ? `已封禁 @${u.username}（全部会话已吊销）` : `已解封 @${u.username}`);
      void load();
    } else {
      toast("error", res.error.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" aria-hidden />
          <input
            className="input pl-9"
            placeholder="搜索用户名 / 邮箱 / 昵称…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="搜索用户"
            style={{ color: "#e9ecff" }}
          />
        </div>
        <div className="flex shrink-0 rounded-[var(--radius)] p-0.5" style={{ backgroundColor: "rgba(125,140,255,0.1)" }} role="tablist" aria-label="状态筛选">
          {(["ALL", "ACTIVE", "SUSPENDED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className="rounded-[var(--radius-sm)] px-3 py-1.5 text-xs transition-colors"
              style={{
                backgroundColor: status === s ? "rgba(125,140,255,0.25)" : "transparent",
                color: status === s ? "#97a2ff" : "#8a92b8",
              }}
            >
              {s === "ALL" ? "全部" : s === "ACTIVE" ? "正常" : "封禁中"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin" style={{ color: "#7d8cff" }} aria-label="加载中" /></div>
      ) : users.length === 0 ? (
        <p className="py-10 text-center text-sm" style={{ color: "#8a92b8" }}>没有符合条件的用户</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)]" style={{ border: "1px solid rgba(125,140,255,0.14)" }}>
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead style={{ backgroundColor: "rgba(22,30,66,0.9)", color: "#8a92b8" }}>
              <tr>
                <th className="px-4 py-2.5 font-medium">用户</th>
                <th className="px-4 py-2.5 font-medium">称号</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">粉丝 / 关注 / 文章</th>
                <th className="px-4 py-2.5 font-medium">注册时间</th>
                <th className="px-4 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody style={{ backgroundColor: "rgba(16,22,50,0.7)" }}>
              {users.map((u) => (
                <tr key={u.id} className="border-t" style={{ borderColor: "rgba(125,140,255,0.1)" }}>
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline" style={{ color: "#e9ecff" }}>
                      {u.displayName ?? u.username}
                    </Link>
                    <span className="ml-1.5 text-[11px]" style={{ color: "#5f6a96" }}>@{u.username}</span>
                    <div className="text-[11px]" style={{ color: "#5f6a96" }}>{u.email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    {u.badge?.enabled ? (
                      <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ color: u.badge.color, border: `1px solid ${u.badge.color}`, backgroundColor: u.badge.bgColor ?? "transparent" }}>
                        {u.badge.text}
                      </span>
                    ) : u.badge ? (
                      <span className="text-[11px]" style={{ color: "#5f6a96" }}>已停用</span>
                    ) : (
                      <span className="text-[11px]" style={{ color: "#5f6a96" }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {u.status === "ACTIVE" ? (
                      <span className="text-[11px]" style={{ color: "#4ade80" }}>正常</span>
                    ) : u.status === "SUSPENDED" ? (
                      <span className="text-[11px]" style={{ color: "#ff7b85" }}>封禁</span>
                    ) : (
                      <span className="text-[11px]" style={{ color: "#8a92b8" }}>{u.status}</span>
                    )}
                    {u.role === "ADMIN" && <span className="ml-1 text-[10px]" style={{ color: "#97a2ff" }}><ShieldCheck size={10} className="inline" aria-hidden /> 管理员</span>}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums" style={{ color: "#aab2e0" }}>
                    {u.counts.followers} / {u.counts.following} / {u.counts.posts}
                  </td>
                  <td className="px-4 py-2.5 text-[11px]" style={{ color: "#8a92b8" }}>
                    {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Link href={`/admin/users/${u.id}`} className="btn btn-outline btn-sm !border-white/20 !text-white/85">详情</Link>
                      {u.status === "ACTIVE" ? (
                        <button type="button" className="btn btn-sm" style={{ backgroundColor: "rgba(216,67,79,0.16)", color: "#ff9aa2", border: "1px solid rgba(255,123,133,0.35)" }} onClick={() => setConfirmBan(u)}>
                          <Ban size={12} aria-hidden /> 封禁
                        </button>
                      ) : (
                        <button type="button" className="btn btn-outline btn-sm !border-white/20 !text-white/85" onClick={() => void toggleBan(u, false)}>
                          <RotateCcw size={12} aria-hidden /> 解封
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmBan !== null}
        title={`封禁 @${confirmBan?.username ?? ""}？`}
        message="封禁后该用户立即被踢出登录（全部会话吊销），无法登录与使用任何写功能。"
        confirmText="确认封禁"
        danger
        onCancel={() => setConfirmBan(null)}
        onConfirm={() => confirmBan && void toggleBan(confirmBan, true)}
      />
    </div>
  );
}
