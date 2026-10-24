"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Flag, ImageOff, MessageCircle, UserRound, UserPlus, UserCheck, X } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import { isFollowingAction, toggleFollowAction } from "../actions/follow.actions";
import { reportUserAction } from "../actions/notification.actions";

/**
 * 用户头像弹出菜单（评论区 / 文章作者卡 / 空间通用）。
 * 功能：查看头像（可下载原图）、关注/已关注、私聊、举报。
 * children 是触发器（头像本身），菜单锚定其下方。
 */
export function UserAvatarMenu({
  username,
  displayName,
  avatarUrl,
  isMe,
  children,
  align = "left",
}: {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  isMe?: boolean;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [avatarViewOpen, setAvatarViewOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open || isMe) return;
    void (async () => {
      const res = await isFollowingAction({ username });
      if (res.success) setFollowing(res.data.following);
    })();
  }, [open, username, isMe]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setReportOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function handleFollow() {
    const res = await toggleFollowAction({ username });
    if (res.success) {
      setFollowing(res.data.following);
      toast("success", res.data.following ? `已关注 ${displayName}` : `已取消关注`);
      // 刷新当前页：对方粉丝数 / 自己关注数立即生效
      router.refresh();
    } else {
      toast("error", res.error.message);
      if (res.error.code === "UNAUTHORIZED" || res.error.code === "FORBIDDEN") router.push("/login");
    }
  }

  async function handleReport() {
    if (reason.trim().length < 2) {
      toast("error", "请填写举报原因（至少 2 个字）");
      return;
    }
    setSubmitting(true);
    const res = await reportUserAction({ username, reason: reason.trim() });
    setSubmitting(false);
    if (res.success) {
      toast("success", "举报已提交，管理员会尽快处理");
      setReportOpen(false);
      setOpen(false);
      setReason("");
    } else {
      toast("error", res.error.message);
    }
  }

  return (
    <span className="relative inline-flex" ref={rootRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`用户菜单：${displayName}`}
        className="rounded-full transition-transform active:scale-95"
      >
        {children}
      </button>

      {open && (
        <span
          className="card pop-in absolute top-[calc(100%+6px)] z-50 block w-52 overflow-hidden p-1 text-left"
          style={{
            [align === "right" ? "right" : "left"]: 0,
            boxShadow: "var(--shadow-lg)",
          }}
          role="menu"
        >
          <MenuItem
            icon={UserRound}
            label="查看头像"
            onClick={() => {
              setAvatarViewOpen(true);
              setOpen(false);
            }}
          />
          {!isMe && (
            <>
              <MenuItem
                icon={following ? UserCheck : UserPlus}
                label={following ? "已关注（点击取消）" : "关注"}
                onClick={() => void handleFollow()}
              />
              <MenuItem
                icon={MessageCircle}
                label="私聊"
                onClick={() => router.push(`/messages?with=${encodeURIComponent(username)}`)}
              />
              <MenuItem icon={Flag} label="举报" danger onClick={() => setReportOpen(true)} />
            </>
          )}
          {isMe && (
            <MenuItem
              icon={UserRound}
              label="我的空间"
              onClick={() => router.push("/space")}
            />
          )}
        </span>
      )}

      {/* 头像查看器：大图预览 + 下载原图 */}
      {avatarViewOpen && (
        <span
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
          onClick={() => setAvatarViewOpen(false)}
          role="dialog"
          aria-label={`${displayName} 的头像`}
        >
          <span className="flex max-h-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 头像走本地 API
              <img
                src={avatarUrl}
                alt={`${displayName} 的头像`}
                className="max-h-[60vh] max-w-full rounded-full object-cover"
                style={{ boxShadow: "0 0 48px rgba(125,140,255,0.35)" }}
              />
            ) : (
              <span className="flex h-40 w-40 items-center justify-center rounded-full text-3xl font-bold" style={{ background: "linear-gradient(135deg, #5152e8, #6d5cff)", color: "#fff" }}>
                {displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="flex items-center gap-2">
              <span className="text-sm text-white/90">{displayName} · @{username}</span>
            </span>
            <span className="flex items-center gap-2">
              {avatarUrl ? (
                <a
                  href={avatarUrl}
                  download={`${username}-头像.png`}
                  className="btn btn-primary btn-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download size={14} aria-hidden />
                  下载头像
                </a>
              ) : (
                <span className="btn btn-outline btn-sm pointer-events-none opacity-60">
                  <ImageOff size={14} aria-hidden />
                  TA 还没有上传头像
                </span>
              )}
              <button type="button" className="btn btn-outline btn-sm" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.4)" }} onClick={() => setAvatarViewOpen(false)}>
                <X size={14} aria-hidden />
                关闭
              </button>
            </span>
          </span>
        </span>
      )}

      {reportOpen && (
        <span
          className="absolute left-0 top-[calc(100%+6px)] z-50 block w-64 p-1"
          role="dialog"
          aria-label="举报用户"
        >
          <span className="card block space-y-2 p-3" style={{ boxShadow: "var(--shadow-lg)" }}>
            <span className="block text-xs font-medium">举报 {displayName}（@{username}）</span>
            <textarea
              className="input min-h-[64px] text-sm"
              placeholder="请说明举报原因（如垃圾广告、人身攻击、违规内容…）"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
            />
            <span className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setReportOpen(false)}>
                取消
              </button>
              <button type="button" className="btn btn-danger btn-sm" disabled={submitting} onClick={() => void handleReport()}>
                提交举报
              </button>
            </span>
          </span>
        </span>
      )}
    </span>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof UserRound;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-[var(--color-bg-elevated)]"
      style={{ color: danger ? "var(--color-danger)" : "var(--color-text-primary)" }}
    >
      <Icon size={14} aria-hidden />
      {label}
    </button>
  );
}
