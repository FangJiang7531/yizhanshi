import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminUser } from "@/lib/auth/admin-guard";
import { ToastProvider } from "@/components/feedback/toast";
import { AdminSidebar, AdminTopbar } from "@/modules/admin/components/admin-shell";

export const metadata: Metadata = {
  title: "管理控制台 · 个人数字工作台",
  robots: { index: false, follow: false }, // 管理端永不收录
};

export const dynamic = "force-dynamic";

/**
 * 管理端外壳：独立布局（不加载用户端侧边栏/命令面板）。
 * 服务级守卫：无有效 AdminSession 一律踢回管理登录页。
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  return (
    <ToastProvider>
      <div className="flex min-h-dvh" style={{ backgroundColor: "#0a0f24", color: "#e9ecff" }}>
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar name={admin.displayName ?? admin.username} username={admin.username} />
          <main className="page-enter mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8">
            <Link
              href="/admin"
              className="mb-1 inline-block text-[11px] opacity-60 transition-opacity hover:opacity-100"
            >
              ← 控制台首页
            </Link>
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
