"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, Menu, X } from "lucide-react";
import Link from "next/link";
import { MODULES } from "@/config/modules";

/**
 * 移动端返回按钮：返回「上一级目录」而非浏览历史（用户要求 13）。
 * 层级规则：详情 → 列表 → 总览。/blog/p/xxx → /blog；/space → /dashboard；以此类推。
 */
export function parentOf(pathname: string): string {
  if (pathname.startsWith("/blog/p/") || pathname.startsWith("/blog/u/") || pathname.startsWith("/blog/tags/") || pathname.startsWith("/blog/search")) {
    return "/blog";
  }
  if (pathname.startsWith("/blog")) return "/dashboard";
  if (pathname.startsWith("/space") || pathname.startsWith("/messages") || pathname.startsWith("/settings")) {
    return "/dashboard";
  }
  if (pathname.startsWith("/links") || pathname.startsWith("/bookmarks") || pathname.startsWith("/surveys") || pathname.startsWith("/downloader") || pathname.startsWith("/converter") || pathname.startsWith("/ai-preview")) {
    return "/dashboard";
  }
  return "/dashboard";
}

export function MobileBackButton({ className = "md:hidden" }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  // /dashboard 与 /blog 根列表页不再显示返回（已是顶层）
  if (pathname === "/dashboard" || pathname === "/blog") return null;

  return (
    <button
      type="button"
      className={`icon-btn ${className}`}
      aria-label="返回上一级"
      title="返回上一级"
      onClick={() => router.push(parentOf(pathname))}
    >
      <ChevronLeft size={18} />
    </button>
  );
}

/**
 * 博客公开侧导航抽屉：点击左上角菜单呼出，列出平台全部板块（公开可浏览的板块直接可进）。
 * 移动端与桌面端都可用（用户要求 10：博客界面左上角快速呼出导航栏）。
 */
export function BlogNavDrawer() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="icon-btn shrink-0"
        aria-label="打开导航菜单"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu size={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-label="导航菜单">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="pop-in relative z-10 flex h-full w-72 max-w-[85vw] flex-col"
            style={{ backgroundColor: "var(--color-bg-surface)", boxShadow: "var(--shadow-lg)" }}
          >
            <header className="flex h-14 shrink-0 items-center justify-between px-4">
              <span className="text-sm font-semibold">导航</span>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="关闭导航">
                <X size={17} />
              </button>
            </header>
            <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-6" aria-label="平台导航">
              <ul className="space-y-0.5">
                <li>
                  <Link href="/dashboard" className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm transition-colors hover:bg-[var(--color-bg-elevated)]" onClick={() => setOpen(false)}>
                    工作台总览
                  </Link>
                </li>
                {MODULES.map((m) => (
                  <li key={m.key}>
                    <Link
                      href={m.path}
                      className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm transition-colors hover:bg-[var(--color-bg-elevated)]"
                      onClick={() => setOpen(false)}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
                        style={{ backgroundColor: `color-mix(in srgb, ${m.accent} 12%, transparent)`, color: m.accent }}
                        aria-hidden
                      >
                        <m.icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{m.name}</span>
                      {m.status !== "ready" && (
                        <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                          即将开放
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
