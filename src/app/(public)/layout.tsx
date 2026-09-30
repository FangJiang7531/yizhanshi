import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ToastProvider } from "@/components/feedback/toast";
import { BlogPublicShell } from "@/modules/blog/components/layout/blog-public-shell";

/**
 * 公开区布局（博客消费侧）。
 *
 * ⚠️ 本布局**绝不能**读取 `cookies()` / `headers()` / `searchParams`。
 *
 * 为什么不能像 (platform) 那样读 Session：
 * 1. 博客公开页要求 SSG + ISR（PRD §3.1，详情页 revalidate 3600）——
 *    任何动态 API 都会把整条路由拉回动态渲染，ISR 直接失效；
 * 2. 更严重的是 Gate 5.2 的缓存隔离判据：外壳一旦把登录态渲染进服务端输出，
 *    缓存就有可能把「用户 A 已登录」的页面回放给访客 B。
 *
 * 因此这里只提供**与身份完全无关**的外壳，登录态由顶栏在客户端自行查询。
 * 同理，主题只走 localStorage（不做 UserSetting 服务端注入）——这是公开页
 * 换取可缓存性付出的代价，可接受。
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ThemeProvider>
        <BlogPublicShell>{children}</BlogPublicShell>
      </ThemeProvider>
    </ToastProvider>
  );
}
