"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar, type TopbarUser } from "./topbar";

/**
 * 平台外壳（客户端容器）：负责侧边栏折叠 / 移动端抽屉等纯 UI 状态。
 * 业务内容通过 children 注入，外壳本身与路由无关，因此切换板块不会重挂载。
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

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-bg-base)" }}>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} onOpenMobileNav={() => setMobileOpen(true)} />
        <main
          className="page-enter mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:px-8"
          style={{ viewTransitionName: "content-area" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
