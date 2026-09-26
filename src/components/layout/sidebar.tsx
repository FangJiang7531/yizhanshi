"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
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
 * - 液态玻璃质感：半透明表面 + 背景模糊 + 高光描边（.glass-panel）
 * - 高亮块内嵌于激活项内部（不靠 JS 测量定位），折叠/展开永不漂移
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
        className="glass-panel fixed inset-y-0 left-0 z-50 flex flex-col transition-[width,transform] duration-200 md:static md:translate-x-0"
        style={{ width: collapsed ? 64 : 240, transform: mobileOpen ? "translateX(0)" : undefined }}
        data-mobile-open={mobileOpen}
        aria-label="主导航"
      >
        {/* 品牌区 */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-sm font-bold"
            style={{
              background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
              color: "var(--color-primary-fg)",
              boxShadow: "var(--shadow-sm)",
            }}
            aria-hidden
          >
            台
          </div>
          {!collapsed && (
            <span className="truncate text-sm font-semibold tracking-wide">个人数字工作台</span>
          )}
        </div>

        {/* 导航区 */}
        <nav className="flex-1 overflow-y-auto px-2.5 pb-2 pt-1">
          {GROUPS.map((group) => {
            const items = MODULES.filter((m) => m.group === group).sort((a, b) => a.order - b.order);
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-3">
                {!collapsed && (
                  <p
                    className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.12em]"
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
                          data-active={isActive}
                          onClick={onCloseMobile}
                          title={collapsed ? m.name : undefined}
                          aria-current={isActive ? "page" : undefined}
                          className="group relative flex items-center gap-2.5 overflow-hidden rounded-[var(--radius-sm)] px-2.5 py-2 text-sm transition-all duration-200"
                          style={{
                            color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                            fontWeight: isActive ? 600 : 400,
                            // 高亮块内嵌于激活项，折叠/展开永不漂移（修复指示块卡在两板块中间的问题）
                            backgroundColor: isActive
                              ? "color-mix(in srgb, " + m.accent + " 14%, transparent)"
                              : "transparent",
                          }}
                        >
                          {/* 左侧指示条：激活时以品牌色亮起 */}
                          <span
                            aria-hidden
                            className="absolute inset-y-1.5 left-0 w-[3px] rounded-full transition-all duration-200"
                            style={{
                              backgroundColor: isActive ? m.accent : "transparent",
                              transform: isActive ? "scaleY(1)" : "scaleY(0.2)",
                            }}
                          />
                          {/* 悬停时的品牌色染光 */}
                          <span
                            aria-hidden
                            className="absolute inset-0 -z-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                            style={{
                              backgroundColor: "color-mix(in srgb, " + m.accent + " 7%, transparent)",
                            }}
                          />
                          <Icon
                            size={17}
                            className="shrink-0 transition-colors"
                            style={{ color: isActive ? m.accent : undefined }}
                            aria-hidden
                          />
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
          style={{ borderColor: "color-mix(in srgb, var(--color-border) 60%, transparent)" }}
        >
          {!collapsed && (
            <button
              type="button"
              className="mb-1 flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-xs transition-colors hover:bg-[var(--color-bg-elevated)]"
              style={{ color: "var(--color-text-muted)" }}
              onClick={() => toast.info("感谢反馈！需求收集入口即将开放")}
            >
              <Sparkles size={13} className="shrink-0" aria-hidden />
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
