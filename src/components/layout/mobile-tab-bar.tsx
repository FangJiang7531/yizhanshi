"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutGrid } from "lucide-react";
import { MODULES } from "@/config/modules";

/** 底部标签栏的 4 个主入口（用户最高频的四个动作，优化文档 §3.7） */
const TAB_KEYS = ["dashboard", "tasks", "habits", "blog"] as const;

/**
 * 移动端底部标签栏：
 * - 4 个主入口 + 最右「更多」打开全量抽屉
 * - 激活态：图标变板块色 + 上方 2px 指示条滑动（layoutId）+ 文字加粗
 * - 向下滚动自动隐藏、向上滚动立即显示（240ms）
 */
export function MobileTabBar({ onOpenMore }: { onOpenMore: () => void }) {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY.current;
        // 滚动超过 8px 才判定方向，避免轻微触碰导致的抖动
        if (dy > 8 && y > 64) setHidden(true);
        else if (dy < -8) setHidden(false);
        lastY.current = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const tabs = TAB_KEYS.map((k) => MODULES.find((m) => m.key === k)!).filter(Boolean);
  const activeKey =
    MODULES.find((m) => pathname === m.path || pathname.startsWith(`${m.path}/`))?.key ?? null;
  const moreActive = activeKey !== null && !TAB_KEYS.includes(activeKey as (typeof TAB_KEYS)[number]);

  return (
    <nav
      className="mobile-tabbar fixed inset-x-0 bottom-0 z-40 md:hidden"
      data-hidden={hidden}
      aria-label="移动端主导航"
      style={{
        backgroundColor: "var(--color-bg-elevated)",
        borderTop: "1px solid color-mix(in srgb, var(--color-border) 35%, transparent)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <ul className="grid h-14 grid-cols-5">
        {tabs.map((m) => {
          const isActive = activeKey === m.key;
          const Icon = m.icon;
          return (
            <li key={m.key} className="relative">
              {isActive && (
                <motion.span
                  layoutId="mobile-tab-indicator"
                  aria-hidden
                  className="absolute inset-x-6 top-0 h-[2px] rounded-b-full"
                  style={{ backgroundColor: m.accent }}
                  transition={{ type: "spring", stiffness: 500, damping: 42 }}
                />
              )}
              <Link
                href={m.path}
                aria-current={isActive ? "page" : undefined}
                className="flex h-full flex-col items-center justify-center gap-0.5"
                style={{ color: isActive ? m.accent : "var(--color-text-muted)" }}
              >
                <span
                  className="transition-transform duration-150"
                  style={{ transform: isActive ? "translateY(-1px)" : "none" }}
                >
                  <Icon size={20} aria-hidden />
                </span>
                <span
                  className="text-[10px] leading-none"
                  style={{ fontWeight: isActive ? 600 : 400 }}
                >
                  {m.name}
                </span>
              </Link>
            </li>
          );
        })}
        {/* 更多：打开全量抽屉 */}
        <li className="relative">
          {moreActive && (
            <motion.span
              layoutId="mobile-tab-indicator"
              aria-hidden
              className="absolute inset-x-6 top-0 h-[2px] rounded-b-full"
              style={{ backgroundColor: "var(--color-primary)" }}
              transition={{ type: "spring", stiffness: 500, damping: 42 }}
            />
          )}
          <button
            type="button"
            onClick={onOpenMore}
            aria-label="打开全部板块"
            className="flex h-full w-full flex-col items-center justify-center gap-0.5"
            style={{ color: moreActive ? "var(--color-primary)" : "var(--color-text-muted)" }}
          >
            <LayoutGrid size={20} aria-hidden />
            <span className="text-[10px] leading-none" style={{ fontWeight: moreActive ? 600 : 400 }}>
              更多
            </span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
