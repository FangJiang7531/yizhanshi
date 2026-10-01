"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Settings, Sparkles, User as UserIcon } from "lucide-react";
import { logoutAction } from "@/modules/auth/actions/auth-actions";
import { useToast } from "@/components/feedback/toast";
import { GuestPromptDialog } from "@/components/feedback/guest-prompt-dialog";
import { UserAvatarView, type TopbarUser } from "./topbar";

/**
 * 侧边栏底部用户卡（优化文档 §3.5）：
 * 头像 + 昵称 + 设置齿轮；点击弹出浮层菜单（个人资料 / 设置 / 功能反馈 / 退出）。
 * 折叠态仅显示头像居中，点击同样弹出浮层。
 */
export function SidebarUserCard({
  user,
  collapsed,
}: {
  user: TopbarUser;
  collapsed: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [guestPrompt, setGuestPrompt] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function onLogout() {
    setMenuOpen(false);
    const res = await logoutAction();
    if (res.success) {
      toast.success("已退出登录");
      router.push("/login");
      router.refresh();
    }
  }

  function go(path: string) {
    setMenuOpen(false);
    if (user.isGuest) {
      setGuestPrompt(true);
      return;
    }
    router.push(path);
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={collapsed ? `用户菜单：${user.displayName}` : undefined}
        className={`group flex w-full items-center rounded-[var(--radius)] transition-colors duration-150 hover:bg-[var(--color-bg-elevated)] ${
          collapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2 py-1.5"
        }`}
      >
        <UserAvatarView
          displayName={user.displayName}
          avatarUrl={user.avatarUrl}
          isGuest={user.isGuest}
          size={32}
        />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13px] font-medium leading-tight">
                {user.displayName}
              </span>
              <span className="block truncate text-[11px] leading-tight" style={{ color: "var(--color-text-muted)" }}>
                {user.isGuest ? "访客模式 · 只读" : `@${user.username}`}
              </span>
            </span>
            <Settings
              size={15}
              aria-hidden
              className="gear-spin shrink-0 transition-colors group-hover:text-[var(--color-text-primary)]"
              style={{ color: "var(--color-text-muted)" }}
            />
          </>
        )}
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="pop-in absolute bottom-[calc(100%+8px)] w-56 overflow-hidden rounded-[var(--radius)] py-1"
          style={{
            left: collapsed ? "calc(100% - 8px)" : 0,
            backgroundColor: "var(--color-bg-elevated)",
            boxShadow: "var(--shadow-lg)",
            border: "1px solid color-mix(in srgb, var(--color-border) 40%, transparent)",
          }}
        >
          <div className="px-3 py-2">
            <p className="text-sm font-medium">{user.displayName}</p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {user.isGuest ? "访客模式 · 只读" : `@${user.username}`}
            </p>
          </div>
          <div className="my-1 h-px" style={{ backgroundColor: "color-mix(in srgb, var(--color-border) 50%, transparent)" }} />
          <MenuItem icon={<UserIcon size={15} />} label="个人资料" onClick={() => go("/settings/profile")} />
          <MenuItem icon={<Settings size={15} />} label="设置" onClick={() => go("/settings")} />
          <MenuItem
            icon={<Sparkles size={15} />}
            label="功能反馈"
            onClick={() => {
              setMenuOpen(false);
              toast.info("感谢反馈！需求收集入口即将开放");
            }}
          />
          <div className="my-1 h-px" style={{ backgroundColor: "color-mix(in srgb, var(--color-border) 50%, transparent)" }} />
          <MenuItem
            icon={<LogOut size={15} />}
            label={user.isGuest ? "退出访客模式" : "退出登录"}
            danger
            onClick={onLogout}
          />
        </div>
      )}

      <GuestPromptDialog
        open={guestPrompt}
        onClose={() => setGuestPrompt(false)}
        onConfirm={() => {
          setGuestPrompt(false);
          router.push("/login");
        }}
        actionLabel="修改设置"
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-150 hover:bg-[var(--color-bg-surface)]"
      style={{ color: danger ? "var(--color-danger)" : "var(--color-text-primary)" }}
    >
      {icon}
      {label}
    </button>
  );
}
