import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { listEnabledProviders } from "@/lib/auth/oauth-service";
import { AuthPanel } from "@/modules/auth/components/auth-panel";

/**
 * 登录 / 注册页（同页 Tab 切换）。
 * 已登录访问 /login → 重定向到 /dashboard（PRD §6.1 入口策略 2）。
 * 服务端下发已配置的 OAuth provider（双要素齐备才渲染可用按钮）。
 */
export default async function LoginPage() {
  const principal = await getPrincipal();
  if (principal) redirect("/dashboard");

  let enabledProviders: string[] = [];
  try {
    enabledProviders = listEnabledProviders();
  } catch {
    // 构建期/无数据库时不阻塞登录页渲染
  }
  return <AuthPanel enabledProviders={enabledProviders} />;
}
