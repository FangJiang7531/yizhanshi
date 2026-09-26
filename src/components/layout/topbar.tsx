"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { LogOut, Menu, Settings, User as UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { logoutAction } from "@/modules/auth/actions/auth-actions";
import { useToast } from "@/components/feedback/toast";
import { GuestPromptDialog } from "@/components/feedback/guest-prompt-dialog";
import { MODULES } from "@/config/modules";

export type TopbarUser = {
  displayName: string;
  username: string;
  isGuest: boolean;
  avatarUrl?: string | null;
};

/**
 * 顶栏：左侧移动端抽屉开关 + 页面标题；右侧主题快捷切换、用户菜单。
 *
 * 外壳常驻（PRD §3.3）：本组件位于 (platform)/layout.tsx，不依赖会变化的
 * searchParams，避免子路由切换时被迫重渲染而破坏「不闪屏」体验。
 */
export function Topbar({
  user,
  onOpenMobileNav,
}: {
  user: TopbarUser;
  onOpenMobileNav: () => void;
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

  return (
    <header className="glass-panel sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-x-0 border-t-0 px-3 sm:px-4">
      <button
        type="button"
        className="icon-btn md:hidden"
        onClick={onOpenMobileNav}
        aria-label="打开导航菜单"
      >
        <Menu size={18} />
      </button>

      <Breadcrumb />

      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
        <NotificationBell toast={toast} />

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 transition-all hover:shadow-[var(--shadow-sm)]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-bg-surface) 78%, transparent)",
              borderColor: "color-mix(in srgb, var(--color-border) 70%, transparent)",
            }}
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <UserAvatarView
              displayName={user.displayName}
              avatarUrl={user.avatarUrl}
              isGuest={user.isGuest}
              size={28}
            />
            <span className="hidden max-w-[110px] truncate text-sm sm:inline">
              {user.displayName}
            </span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="pop-in absolute right-0 top-[calc(100%+6px)] w-56 overflow-hidden rounded-[var(--radius)] border py-1"
              style={{
                backgroundColor: "var(--color-bg-surface)",
                borderColor: "var(--color-border)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div className="border-b px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
                <p className="text-sm font-medium">{user.displayName}</p>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {user.isGuest ? "访客模式 · 只读" : `@${user.username}`}
                </p>
              </div>

              <MenuItem
                icon={<UserIcon size={15} />}
                label="个人资料"
                onClick={() => {
                  setMenuOpen(false);
                  if (user.isGuest) setGuestPrompt(true);
                  else router.push("/settings/profile");
                }}
              />
              <MenuItem
                icon={<Settings size={15} />}
                label="设置"
                onClick={() => {
                  setMenuOpen(false);
                  if (user.isGuest) setGuestPrompt(true);
                  else router.push("/settings");
                }}
              />
              <div className="my-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
              <MenuItem
                icon={<LogOut size={15} />}
                label={user.isGuest ? "退出访客模式" : "退出登录"}
                danger
                onClick={onLogout}
              />
            </div>
          )}
        </div>
      </div>

      <GuestPromptDialog
        open={guestPrompt}
        onClose={() => setGuestPrompt(false)}
        onConfirm={() => {
          setGuestPrompt(false);
          router.push("/login");
        }}
        actionLabel="修改设置"
      />
    </header>
  );
}

/** 头像：有图显示图片，否则回退到首字母圆形章 */
export function UserAvatarView({
  displayName,
  avatarUrl,
  isGuest,
  size = 28,
}: {
  displayName: string;
  avatarUrl?: string | null;
  isGuest?: boolean;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 头像走本地 API 路由，next/image 需额外域名配置
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
        color: "var(--color-primary-fg)",
      }}
      aria-hidden
    >
      {isGuest ? "访" : displayName.slice(0, 1).toUpperCase()}
    </span>
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
      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-[var(--color-bg-elevated)]"
      style={{ color: danger ? "var(--color-danger)" : "var(--color-text-primary)" }}
    >
      {icon}
      {label}
    </button>
  );
}

function Breadcrumb() {
  return (
    <nav aria-label="面包屑" className="hidden items-center gap-1.5 text-sm sm:flex">
      <Link href="/dashboard" className="transition-colors" style={{ color: "var(--color-text-muted)" }}>
        工作台
      </Link>
      <span style={{ color: "var(--color-text-muted)" }}>/</span>
      <CurrentPageName />
    </nav>
  );
}

function CurrentPageName() {
  const path = usePathname();
  const m = MODULES.find((x) => path === x.path || path.startsWith(`${x.path}/`));
  return <span className="font-medium">{m?.name ?? "总览"}</span>;
}

function NotificationBell({ toast }: { toast: ReturnType<typeof useToast> }) {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label="通知"
      title="通知（开发中）"
      onClick={() => toast.info("通知中心开发中")}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    </button>
  );
}
