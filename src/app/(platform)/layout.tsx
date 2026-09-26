import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ToastProvider } from "@/components/feedback/toast";
import { PlatformShell } from "@/components/layout/platform-shell";
import { persistAppearanceAction } from "@/modules/auth/actions/settings-actions";
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
    ? { displayName: principal.guest.displayName, username: "guest", isGuest: true, avatarUrl: null }
    : {
        displayName: principal.user.displayName ?? principal.user.username,
        username: principal.user.username,
        isGuest: false,
        avatarUrl: principal.user.avatarUrl,
      };

  // 已登录：从 UserSetting 读取主题偏好（换设备登录后主题跟随，A-15）
  const setting = isGuest
    ? null
    : await prisma.userSetting.findUnique({ where: { userId: principal.user.id } });

  const initialTheme = setting?.themeName as ThemeName | undefined;
  const initialMode = setting?.colorMode.toLowerCase() as ColorMode | undefined;
  const initialMotion = setting?.motionEnabled;

  // 直接传 Server Action 引用（Server Component → Client Component 不能传内联闭包）
  const persistToServer = isGuest ? undefined : persistAppearanceAction;

  return (
    <ToastProvider>
      <ThemeProvider
        initialTheme={initialTheme}
        initialMode={initialMode}
        initialMotion={initialMotion}
        persistToServer={persistToServer}
      >
        <PlatformShell user={user}>{children}</PlatformShell>
      </ThemeProvider>
    </ToastProvider>
  );
}
