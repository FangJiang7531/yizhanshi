import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";

/**
 * 根路由 → /dashboard。
 * 未登录时由 middleware.ts 先重定向到 /login（此处再做一次服务端兜底）。
 */
export default async function RootPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");
  redirect("/dashboard");
}
