"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState } from "react";
import {
  MODULES,
  MODULE_GROUP_LABELS,
  type ModuleMeta,
} from "@/config/modules";
import { useToast } from "@/components/feedback/toast";

const GROUPS: ModuleMeta["group"][] = ["core", "content", "tools"];

/**
 * 侧边栏 —— 完全由 src/config/modules.ts 驱动。
 *
 * 关键设计（PRD §3.3 / §9.1）：
 * - 外壳常驻：本组件位于 (platform)/layout.tsx，子路由切换时不重新挂载
 * - available=false 的板块显示「即将开放」小标签，点击跳转到占位页（不禁用，
 *   禁用会让用户以为功能坏了）
 * - 当前路由高亮，指示条带滑动过渡
 * - 移动端转为抽屉
 */
export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const toast = useToast();
  const [activeRect, setActiveRect] = useState<{ top: number; height: number } | null>(null);

  // 高亮指示条位置：按当前路径计算
  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>("[data-nav-item]");
    for (const el of items) {
      if (el.dataset.active === "true") {
        setActiveRect({ top: el.offsetTop, height: el.offsetHeight });
        return;
      }
    }
    setActiveRect(null);
  }, [pathname, collapsed]);

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
        className="fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-[width,transform] duration-200 md:static md:translate-x-0"
        style={{
          width: collapsed ? 64 : 240,
          backgroundColor: "var(--color-bg-surface)",
          borderColor: "var(--color-border)",
          transform: mobileOpen ? "translateX(0)" : undefined,
        }}
        data-mobile-open={mobileOpen}
        aria-label="主导航"
      >
        {/* 品牌区 */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-sm font-bold"
            style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-fg)" }}
            aria-hidden
          >
            台
          </div>
          {!collapsed && (
            <span className="truncate text-sm font-semibold">个人数字工作台</span>
          )}
        </div>

        {/* 导航区 */}
        <nav className="relative flex-1 overflow-y-auto px-2.5 py-2">
          {activeRect && !collapsed && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-2.5 w-[calc(100%-20px)] rounded-[var(--radius-sm)] transition-all duration-200"
              style={{
                top: activeRect.top,
                height: activeRect.height,
                backgroundColor: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
              }}
            />
          )}

          {GROUPS.map((group) => {
            const items = MODULES.filter((m) => m.group === group).sort((a, b) => a.order - b.order);
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-3">
                {!collapsed && (
                  <p
                    className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {MODULE_GROUP_LABELS[group]}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {items.map((m) => {
                    const isActive = active?.key === m.key;
                    const Icon = m.icon;
                    const isReady = m.status === "ready";
                    return (
                      <li key={m.key}>
                        <Link
                          href={m.path}
                          data-nav-item
                          data-active={isActive}
                          onClick={onCloseMobile}
                          title={collapsed ? m.name : undefined}
                          className="group relative z-10 flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm transition-colors"
                          style={{
                            color: isActive
                              ? "var(--color-primary)"
                              : "var(--color-text-secondary)",
                            fontWeight: isActive ? 600 : 400,
                          }}
                        >
                          <Icon size={17} className="shrink-0" aria-hidden />
                          {!collapsed && (
                            <>
                              <span className="flex-1 truncate">{m.name}</span>
                              {!isReady && (
                                <span
                                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-none"
                                  style={{
                                    backgroundColor: "var(--color-bg-elevated)",
                                    color: "var(--color-text-muted)",
                                    border: "1px solid var(--color-border)",
                                  }}
                                >
                                  即将开放
                                </span>
                              )}
                            </>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* 底部：折叠开关 + 反馈入口 */}
        <div
          className="shrink-0 border-t p-2.5"
          style={{ borderColor: "var(--color-border)" }}
        >
          {!collapsed && (
            <button
              type="button"
              className="mb-1 flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-xs transition-colors"
              style={{ color: "var(--color-text-muted)" }}
              onClick={() => toast.info("感谢反馈！需求收集入口即将开放")}
            >
              <SparkleIcon />
              想要什么功能？告诉我们 →
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost w-full !justify-start !px-2.5"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            {!collapsed && <span className="text-xs">折叠侧边栏</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

function SparkleIcon() {
  return <ChevronLeft size={13} className="shrink-0 rotate-180" aria-hidden />;
}
