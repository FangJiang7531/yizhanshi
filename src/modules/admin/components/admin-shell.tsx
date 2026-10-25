"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, Megaphone, MessageSquareWarning, ShieldCheck, ToggleRight, Users, LayoutDashboard, LogOut, FileWarning } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import { adminLogoutAction } from "../actions/admin-auth.actions";

/** 管理端导航 */
const NAV = [
  { href: "/admin", label: "概览", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "用户管理", icon: Users },
  { href: "/admin/moderation", label: "内容审核", icon: FileWarning },
  { href: "/admin/features", label: "功能开关", icon: ToggleRight },
  { href: "/admin/announcements", label: "公告管理", icon: Megaphone },
  { href: "/admin/messages", label: "系统私信", icon: MessageSquareWarning },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside
      className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r md:flex"
      style={{ backgroundColor: "rgba(10,15,36,0.9)", borderColor: "rgba(125,140,255,0.14)" }}
      aria-label="管理导航"
    >
      <div className="flex h-14 items-center gap-2 px-4">
        <ShieldCheck size={18} style={{ color: "#7d8cff" }} aria-hidden />
        <span className="text-sm font-semibold">管理控制台</span>
      </div>
      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm transition-colors"
              style={{
                backgroundColor: active ? "rgba(125,140,255,0.14)" : "transparent",
                color: active ? "#97a2ff" : "#aab2e0",
                fontWeight: active ? 600 : 400,
              }}
            >
              <item.icon size={15} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 pb-4 text-[10px]" style={{ color: "#5f6a96" }}>
        与用户端完全隔离
      </div>
    </aside>
  );
}

export function AdminTopbar({ name, username }: { name: string; username: string }) {
  const toast = useToast();
  const pathname = usePathname();
  const current = NAV.find((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href)));

  async function logout() {
    const res = await adminLogoutAction();
    if (res.success) {
      toast("success", "已退出管理控制台");
      window.location.assign("/admin/login");
    }
  }

  return (
    <header
      className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-8"
      style={{ backgroundColor: "rgba(10,15,36,0.85)", backdropFilter: "blur(12px)", borderColor: "rgba(125,140,255,0.14)" }}
    >
      <span className="flex items-center gap-2 text-sm font-medium md:hidden">
        <ShieldCheck size={15} style={{ color: "#7d8cff" }} aria-hidden />
        {current?.label ?? "管理"}
      </span>
      <nav className="hidden gap-1 md:flex">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] transition-colors"
            style={{ color: pathname.startsWith(n.href) ? "#97a2ff" : "#7d82ad" }}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-xs">
        <span className="hidden items-center gap-1.5 sm:flex" style={{ color: "#aab2e0" }}>
          <BadgeCheck size={14} style={{ color: "#7d8cff" }} aria-hidden />
          {name}（@{username}）
        </span>
        <button type="button" className="btn btn-outline btn-sm !border-white/25 !text-white/85" onClick={() => void logout()}>
          <LogOut size={13} aria-hidden />
          退出
        </button>
      </div>
    </header>
  );
}
