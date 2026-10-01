"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useToast } from "@/components/feedback/toast";
import { MODULES } from "@/config/modules";

export type TopbarUser = {
  displayName: string;
  username: string;
  isGuest: boolean;
  avatarUrl?: string | null;
};

/**
 * 顶栏（无界化精简版）：左侧移动端抽屉开关 + 面包屑；
 * 右侧命令面板快捷入口（移动端）、主题切换、通知。
 *
 * 用户菜单已下沉到侧边栏底部用户卡（优化文档 §3.5），顶栏不再承担身份职能，
 * 视觉上更轻，与内容区的边界仅靠背景色差与滚动时的毛玻璃分层。
 */
export function Topbar({
  onOpenMobileNav,
}: {
  /** 保留在签名中：用户菜单虽下沉到侧边栏，外壳仍统一传入身份信息 */
  user: TopbarUser;
  onOpenMobileNav: () => void;
}) {
  const toast = useToast();

  return (
    <header
      className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 px-3 sm:px-4"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-bg-base) 72%, transparent)",
        backdropFilter: "blur(16px) saturate(1.4)",
        WebkitBackdropFilter: "blur(16px) saturate(1.4)",
      }}
    >
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
        {/* 移动端命令面板入口（桌面端入口在侧边栏） */}
        <button
          type="button"
          className="icon-btn md:hidden"
          aria-label="搜索或跳转"
          onClick={() => window.dispatchEvent(new CustomEvent("wb:open-command-palette"))}
        >
          <Search size={17} />
        </button>
        <ThemeToggle />
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
      </div>
    </header>
  );
}

/** 头像：有图显示图片，否则回退到首字母圆形章（侧边栏用户卡复用） */
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

function Breadcrumb() {
  return (
    <nav aria-label="面包屑" className="hidden items-center gap-1.5 text-sm sm:flex">
      <Link
        href="/dashboard"
        className="link-draw transition-colors"
        style={{ color: "var(--color-text-muted)" }}
      >
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
