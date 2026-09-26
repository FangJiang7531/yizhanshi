import type { ReactNode } from "react";

/**
 * 认证区独立极简布局：(auth) 路由组不加载侧边栏外壳。
 *
 * 承载方式说明（PRD §6.1）：用户要求“进入页面直接弹出登录界面”，
 * 实现为整页登录页而非浮层弹窗——浮层在移动端与键盘弹出场景体验差，
 * 且不利于无障碍。
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 py-10"
      style={{ backgroundColor: "var(--color-bg-base)", color: "var(--color-text-primary)" }}
    >
      {children}
    </div>
  );
}
