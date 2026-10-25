import type { Metadata } from "next";
import { ToastProvider } from "@/components/feedback/toast";
import { AdminLoginForm } from "@/modules/admin/components/admin-login-form";

export const metadata: Metadata = {
  title: "管理登录 · 个人数字工作台",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** 管理端登录页（独立于用户登录；双因子：密码 + 服务器密钥） */
export default function AdminLoginPage() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center px-4"
      style={{
        backgroundColor: "#0a0f24",
        backgroundImage: "url(/wallpaper/wave-pc.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(6,10,26,0.72)" }} aria-hidden />
      <div className="relative z-10">
        <ToastProvider>
          <AdminLoginForm />
        </ToastProvider>
      </div>
    </div>
  );
}
