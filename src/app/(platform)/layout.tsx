import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ToastProvider } from "@/components/feedback/toast";
import { PlatformShell } from "@/components/layout/platform-shell";
import type { ThemeName, ColorMode } from "@/lib/theme/tokens";

/**
 * 平台外壳布局 —— 侧边栏 / 顶栏 / 背景常驻于此。
 *
 * 关键点（PRD §3.3 规则 1「外壳常驻」）：
 * 子路由切换时本布局不重新挂载，用户感觉「在同一个网站里换房间」。
 * 因此这里不得依赖会变化的 searchParams，也不得做会触发重渲染的读取。
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");

  const isGuest = "guest" in principal;
  const user = isGuest
    ? { displayName: principal.guest.displayName, username: "guest", isGuest: true }
    : {
        displayName: principal.user.displayName ?? principal.user.username,
        username: principal.user.username,
        isGuest: false,
      };

  return (
    <ToastProvider>
      <ThemeProvider
        initialTheme={undefined as ThemeName | undefined}
        initialMode={undefined as ColorMode | undefined}
      >
        <PlatformShell user={user}>{children}</PlatformShell>
      </ThemeProvider>
    </ToastProvider>
  );
}
