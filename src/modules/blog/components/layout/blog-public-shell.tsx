"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Tags, Compass, PenLine, LayoutList } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getViewerIdentityAction } from "../../actions/post.actions";

/**
 * 博客公开外壳（消费侧）。
 *
 * 三条硬约束：
 * 1. **不读 Cookie**：本组件是客户端组件，登录态一律在挂载后通过
 *    `getViewerIdentityAction` 查询。原因见 `(public)/layout.tsx` 注释 ——
 *    公开页是 SSG + ISR，服务端读 Session 会破坏缓存并造成跨用户污染（Gate 5.2）。
 * 2. **不另造导航体系**（PRD §3.3）：只提供博客内部的二级导航（发现/标签/搜索），
 *    不复制平台侧边栏；视觉沿用平台设计语言（glass-panel + 语义变量）。
 * 3. **排版差异化**（PRD §8.2）：列表页 1080px 容器、正文页由页面自身收窄到 720px。
 */

const NAV = [
  { href: "/blog", label: "发现", icon: Compass, exact: true },
  { href: "/blog/tags", label: "标签", icon: Tags, exact: false },
  { href: "/blog/search", label: "搜索", icon: Search, exact: false },
] as const;

type Identity = { userId: string | null; isGuest: boolean; username: string | null } | null;

export function BlogPublicShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [identity, setIdentity] = useState<Identity | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void getViewerIdentityAction()
      .then((res) => {
        if (!alive) return;
        setIdentity(res.success ? res.data : null);
      })
      .catch(() => {
        if (alive) setIdentity(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "var(--color-bg-base)" }}>
      <header className="glass-panel sticky top-0 z-30 border-x-0 border-t-0">
        <div className="mx-auto flex h-14 w-full max-w-[1080px] items-center gap-2 px-4 sm:px-6">
          <Link
            href="/blog"
            className="mr-1 flex shrink-0 items-center gap-2 text-sm font-semibold tracking-wide"
          >
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[13px] font-bold"
              style={{
                background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
                color: "var(--color-primary-fg)",
              }}
            >
              博
            </span>
            <span className="hidden sm:inline">博客</span>
          </Link>

          <nav aria-label="博客导航" className="flex items-center gap-0.5">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--color-bg-elevated)]"
                  style={{
                    color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <Icon size={15} aria-hidden />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <AccountArea identity={identity} />
          </div>
        </div>
      </header>

      <main className="page-enter mx-auto w-full max-w-[1080px] flex-1 px-4 py-7 sm:px-6 sm:py-9">
        {children}
      </main>

      <footer
        className="border-t px-4 py-6 text-xs sm:px-6"
        style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
      >
        <div className="mx-auto flex w-full max-w-[1080px] flex-wrap items-center gap-x-3 gap-y-2">
          <span>个人数字工作台 · 博客</span>
          <a
            href="/blog/rss.xml"
            className="transition-colors hover:text-[var(--color-primary)]"
            title="订阅全站 RSS"
          >
            RSS 订阅
          </a>
          <Link href="/dashboard" className="ml-auto transition-colors hover:text-[var(--color-primary)]">
            回到工作台 →
          </Link>
        </div>
      </footer>
    </div>
  );
}

/**
 * 账号区：三态（未查询完 / 未登录 / 已登录）。
 * 未查询完时用等宽占位而不是骨架动画 —— 每次进入公开页都闪一次骨架屏反而更吵。
 */
function AccountArea({ identity }: { identity: Identity | undefined }) {
  if (identity === undefined) {
    return <span aria-hidden className="inline-block h-8 w-[74px]" />;
  }

  if (identity === null) {
    return (
      <Link href="/login?next=/blog/me" className="btn btn-outline btn-sm">
        登录
      </Link>
    );
  }

  return (
    <>
      <Link href="/blog/me" className="btn btn-ghost btn-sm !px-2" aria-label="我的文章" title="我的文章">
        <LayoutList size={16} aria-hidden />
        <span className="hidden sm:inline">我的文章</span>
      </Link>
      <Link href="/blog/new" className="btn btn-primary btn-sm" aria-label={identity.isGuest ? "登录后写作" : "写文章"}>
        <PenLine size={15} aria-hidden />
        <span className="hidden sm:inline">写文章</span>
      </Link>
    </>
  );
}
