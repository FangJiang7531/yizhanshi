import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { AuthPanel } from "@/modules/auth/components/auth-panel";

/**
 * 登录 / 注册页（同页 Tab 切换）。
 * 已登录访问 /login → 重定向到 /dashboard（PRD §6.1 入口策略 2）。
 */
export default async function LoginPage() {
  const principal = await getPrincipal();
  if (principal) redirect("/dashboard");
  return <AuthPanel />;
}
