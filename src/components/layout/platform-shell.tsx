"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar, type TopbarUser } from "./topbar";
import { CommandPalette, useRecentPageTracker } from "./command-palette";
import { MobileTabBar } from "./mobile-tab-bar";
import { BackToTop } from "./back-to-top";
import { getModuleMeta } from "@/config/modules";

/**
 * 板块排版节奏（优化文档 §4.2）：
 * 工作型 1280px（高密度）/ 标准型 1080px / 阅读型 720px。
 * 博客平台侧（我的文章、编辑器）是工作场景，用工作型宽度；
 * 阅读型 720px 由博客公开侧自己的外壳实现。
 */
const MODULE_WIDTH: Record<string, string> = {
  dashboard: "var(--work-width)",
  tasks: "var(--work-width)",
  habits: "var(--standard-width)",
  blog: "var(--work-width)",
  links: "var(--standard-width)",
  bookmarks: "var(--standard-width)",
  surveys: "var(--reading-width)",
  downloader: "var(--work-width)",
  converter: "var(--standard-width)",
};

/**
 * 平台外壳（客户端容器）：负责侧边栏折叠 / 移动端抽屉等纯 UI 状态。
 * 业务内容通过 children 注入，外壳本身与路由无关，因此切换板块不会重挂载。
 *
 * 无界化重构：内容区按板块定宽（排版节奏差异化）；上下边缘以渐变遮罩
 * 与背景融接（呼吸边界），内容不再被硬切断。
 */
export function PlatformShell({
  user,
  children,
}: {
  user: TopbarUser;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  useRecentPageTracker();

  const mod = getModuleMeta(pathname);
  const contentMaxWidth = (mod && MODULE_WIDTH[mod.key]) ?? "var(--standard-width)";

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-bg-base)" }}>
      <Sidebar
        user={user}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} onOpenMobileNav={() => setMobileOpen(true)} />
        <main
          className="page-enter mx-auto w-full flex-1 px-4 pb-20 pt-2 sm:px-6 md:pb-6 lg:px-8"
          style={{
            viewTransitionName: "content-area",
            maxWidth: contentMaxWidth,
            transition: "max-width var(--duration-base) var(--ease-out)",
          }}
          data-module={mod?.key ?? "unknown"}
        >
          {/* 呼吸边界：顶部渐变，内容柔和地“开始” */}
          <div className="content-fade-top" aria-hidden />
          {children}
          {/* 呼吸边界：底部渐变，内容柔和地“结束” */}
          <div className="content-fade-bottom" aria-hidden />
        </main>
      </div>

      {/* 全局增强：命令面板 / 移动端底部标签栏 / 回到顶部 */}
      <CommandPalette isGuest={user.isGuest} />
      <MobileTabBar onOpenMore={() => setMobileOpen(true)} />
      <BackToTop />
    </div>
  );
}
