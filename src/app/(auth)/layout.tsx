import type { ReactNode } from "react";
import { ToastProvider } from "@/components/feedback/toast";
import { LoginTechBackground } from "@/modules/auth/components/login-tech-background";

/**
 * 认证区独立极简布局：(auth) 路由组不加载侧边栏外壳。
 *
 * 承载方式说明（PRD §6.1）：用户要求“进入页面直接弹出登录界面”，
 * 实现为整页登录页而非浮层弹窗——浮层在移动端与键盘弹出场景体验差，
 * 且不利于无障碍。
 *
 * 2026-10：登录页新增科技感静态背景（命令行/计算式/代码片段漂浮元素），
 * 纯 CSS 实现、pointer-events:none，登录卡片 z-10 置于其上不受遮挡。
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div
        className="relative min-h-screen w-full px-4 py-10"
        style={{ backgroundColor: "var(--color-bg-base)", color: "var(--color-text-primary)" }}
      >
        <LoginTechBackground />
        <div className="relative z-10 flex min-h-[calc(100vh-5rem)] items-center justify-center">
          {children}
        </div>
      </div>
    </ToastProvider>
  );
}
