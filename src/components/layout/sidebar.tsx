"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import {
  MODULES,
  MODULE_GROUP_LABELS,
  type ModuleMeta,
} from "@/config/modules";
import type { TopbarUser } from "./topbar";
import { SidebarUserCard } from "./sidebar-user-card";

const GROUPS: ModuleMeta["group"][] = ["core", "content", "tools"];

/** 分组默认展开状态：核心/内容常驻展开，工具默认收起（优化文档 §3.2） */
const GROUP_DEFAULT_OPEN: Record<ModuleMeta["group"], boolean> = {
  core: true,
  content: true,
  tools: false,
};

const GROUP_LS_KEY = "wb_nav_groups";

function readGroupState(): Record<ModuleMeta["group"], boolean> {
  if (typeof window === "undefined") return GROUP_DEFAULT_OPEN;
  try {
    const raw = window.localStorage.getItem(GROUP_LS_KEY);
    if (!raw) return GROUP_DEFAULT_OPEN;
    const parsed = JSON.parse(raw) as Partial<Record<ModuleMeta["group"], boolean>>;
    return { ...GROUP_DEFAULT_OPEN, ...parsed };
  } catch {
    return GROUP_DEFAULT_OPEN;
  }
}

/**
 * 侧边栏 —— 完全由 src/config/modules.ts 驱动。
 *
 * 无界化重构（优化文档第三章）：
 * - 260px 展开 / 64px 折叠轨道，宽度过渡 240ms，文字延迟淡入不挤压
 * - 分组标题可折叠（chevron 旋转 200ms），状态记忆在 localStorage
 * - 激活指示条用 framer-motion layoutId 跨条目平滑滑动（220ms 弹性）
 * - 与内容区之间靠背景色差分层，不使用分割线
 * - 顶部品牌区 + 命令面板触发入口（⌘K）；底部用户卡
 */
export function Sidebar({
  user,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: {
  user: TopbarUser;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const [groupOpen, setGroupOpen] = useState(GROUP_DEFAULT_OPEN);

  // 挂载后读取记忆中的分组折叠状态（避免 SSR/CSR 不一致）
  useEffect(() => {
    setGroupOpen(readGroupState());
  }, []);

  function toggleGroup(group: ModuleMeta["group"]) {
    setGroupOpen((prev) => {
      const next = { ...prev, [group]: !prev[group] };
      try {
        window.localStorage.setItem(GROUP_LS_KEY, JSON.stringify(next));
      } catch {
        /* localStorage 不可用时静默降级 */
      }
      return next;
    });
  }

  const active = MODULES.find((m) => pathname === m.path || pathname.startsWith(`${m.path}/`));

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/45 md:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}
      <aside
        className="fixed inset-y-0 left-0 z-50 flex flex-col transition-[width,transform] duration-200 md:static md:translate-x-0"
        style={{
          width: collapsed ? "var(--nav-width-collapsed)" : "var(--nav-width-expanded)",
          transform: mobileOpen ? "translateX(0)" : undefined,
          backgroundColor: "var(--color-bg-surface)",
          transitionTimingFunction: "var(--ease-out)",
        }}
        data-mobile-open={mobileOpen}
        aria-label="主导航"
      >
        {/* 品牌区：Logo + 站名 + 折叠按钮（§3.4） */}
        <div
          className={`flex h-14 shrink-0 items-center ${collapsed ? "justify-center px-2" : "gap-2.5 px-4"}`}
        >
          <Link
            href="/dashboard"
            className="flex min-w-0 items-center gap-2.5"
            aria-label="回到总览"
            onClick={onCloseMobile}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[13px] font-bold"
              style={{
                background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
                color: "var(--color-primary-fg)",
              }}
              aria-hidden
            >
              台
            </span>
            <span
              className="truncate text-sm font-semibold tracking-wide transition-opacity duration-150"
              style={{
                opacity: collapsed ? 0 : 1,
                width: collapsed ? 0 : "auto",
                overflow: "hidden",
                whiteSpace: "nowrap",
                transitionDelay: collapsed ? "0ms" : "60ms",
              }}
            >
              个人数字工作台
            </span>
          </Link>
          {!collapsed && (
            <button
              type="button"
              className="icon-btn ml-auto !h-7 !w-7 shrink-0"
              onClick={onToggleCollapse}
              aria-label="折叠侧边栏"
              title="折叠侧边栏"
            >
              <PanelLeftClose size={15} />
            </button>
          )}
        </div>

        {/* 命令面板触发入口：看起来像一个可点击的搜索框（§3.4） */}
        <div className={`shrink-0 pb-2 ${collapsed ? "px-2" : "px-3"}`}>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("wb:open-command-palette"))}
            aria-label="打开命令面板（Ctrl+K）"
            className={`flex h-9 w-full items-center rounded-[var(--radius)] transition-colors duration-150 hover:bg-[var(--color-bg-elevated)] ${
              collapsed ? "justify-center" : "gap-2.5 px-3"
            }`}
            style={{ backgroundColor: "var(--color-bg-base)" }}
          >
            <Search size={15} className="shrink-0" style={{ color: "var(--color-text-muted)" }} aria-hidden />
            {!collapsed && (
              <>
                <span className="flex-1 truncate text-left text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                  搜索或跳转…
                </span>
                <kbd
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-none"
                  style={{
                    backgroundColor: "var(--color-bg-elevated)",
                    color: "var(--color-text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Ctrl K
                </kbd>
              </>
            )}
          </button>
        </div>

        {/* 导航区：分组可折叠（§3.3） */}
        <nav className={`flex-1 overflow-y-auto pb-2 ${collapsed ? "px-2" : "px-3"}`}>
          {GROUPS.map((group, gi) => {
            const items = MODULES.filter((m) => m.group === group).sort((a, b) => a.order - b.order);
            if (items.length === 0) return null;
            const open = groupOpen[group];
            return (
              <div key={group} className={gi === 0 ? "" : collapsed ? "mt-3" : "mt-5"}>
                {/* 折叠轨道：分组之间用 24px 极浅细线分隔（§3.3.4） */}
                {collapsed ? (
                  gi > 0 && (
                    <div
                      aria-hidden
                      className="mx-auto mb-3 h-px w-6"
                      style={{ backgroundColor: "color-mix(in srgb, var(--color-border) 60%, transparent)" }}
                    />
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    aria-expanded={open}
                    className="group flex h-7 w-full items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors duration-150"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    <ChevronDown size={12} aria-hidden className="group-chevron" data-open={open} />
                    <span className="transition-colors duration-150 group-hover:text-[var(--color-text-secondary)]">
                      {MODULE_GROUP_LABELS[group]}
                    </span>
                  </button>
                )}
                {/* 分组条目：高度动画折叠（0 ↔ auto），无瞬间跳变 */}
                <motion.div
                  initial={false}
                  animate={{ height: collapsed || open ? "auto" : 0, opacity: collapsed || open ? 1 : 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  style={{ overflow: "hidden" }}
                >
                  <ul className={collapsed ? "space-y-1" : "space-y-0.5 pt-1"}>
                    {items.map((m) => (
                      <NavItem
                        key={m.key}
                        mod={m}
                        isActive={active?.key === m.key}
                        collapsed={collapsed}
                        onNavigate={onCloseMobile}
                      />
                    ))}
                  </ul>
                </motion.div>
              </div>
            );
          })}
        </nav>

        {/* 底部：折叠按钮（折叠态）+ 用户卡（§3.5） */}
        <div className={`shrink-0 ${collapsed ? "p-2" : "p-3"}`}>
          {collapsed && (
            <button
              type="button"
              className="icon-btn mb-2 w-full"
              onClick={onToggleCollapse}
              aria-label="展开侧边栏"
              title="展开侧边栏"
            >
              <PanelLeftOpen size={17} />
            </button>
          )}
          <SidebarUserCard user={user} collapsed={collapsed} />
        </div>
      </aside>
    </>
  );
}

/** 单个导航条目（§3.3.3）：激活指示条用 layoutId 跨条目滑动 */
function NavItem({
  mod,
  isActive,
  collapsed,
  onNavigate,
}: {
  mod: ModuleMeta;
  isActive: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const Icon = mod.icon;
  const isReady = mod.status === "ready";

  return (
    <li className="group/item relative">
      <Link
        href={mod.path}
        data-active={isActive}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        aria-label={collapsed ? mod.name : undefined}
        className={`relative flex items-center rounded-[var(--radius)] transition-colors duration-150 ${
          collapsed ? "h-10 justify-center" : "h-10 gap-3 px-3"
        }`}
        style={{
          color: isActive ? mod.accent : "var(--color-text-secondary)",
          fontWeight: isActive ? 550 : 450,
          fontSize: 14,
          backgroundColor: isActive
            ? `color-mix(in srgb, ${mod.accent} 12%, transparent)`
            : "transparent",
        }}
      >
        {/* 悬停背景淡入（非激活态） */}
        {!isActive && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-[var(--radius)] opacity-0 transition-opacity duration-150 group-hover/item:opacity-100"
            style={{ backgroundColor: "var(--color-bg-elevated)" }}
          />
        )}
        {/* 激活指示条：layoutId 让它在条目间平滑滑动（220ms 弹性） */}
        {isActive && !collapsed && (
          <motion.span
            layoutId="nav-indicator"
            aria-hidden
            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
            style={{ backgroundColor: mod.accent }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
        <Icon size={20} className="relative shrink-0" aria-hidden />
        {!collapsed && (
          <>
            <span className="relative flex-1 truncate">{mod.name}</span>
            {!isReady && (
              <span
                className="relative shrink-0 text-[10px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                即将开放
              </span>
            )}
          </>
        )}
      </Link>
      {/* 折叠轨道 Tooltip：悬停 300ms 后浮现（CSS transition-delay 实现，无 JS 计时器） */}
      {collapsed && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs opacity-0 transition-opacity duration-150 group-hover/item:opacity-100 group-hover/item:delay-300"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            color: "var(--color-text-primary)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <span className="font-medium">{mod.name}</span>
          <span className="ml-1.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            {MODULE_GROUP_LABELS[mod.group]}
          </span>
        </span>
      )}
    </li>
  );
}
