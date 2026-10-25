import Link from "next/link";
import { createAdminService } from "@/modules/admin/services/admin.service";

/** 管理概览：核心指标 + 快捷入口 */
export default async function AdminHomePage() {
  const stats = await createAdminService().stats();

  const cells: { label: string; value: number | string; hint?: string; href?: string }[] = [
    { label: "注册用户", value: stats.users, hint: `24h 新增 ${stats.newUsers24h}`, href: "/admin/users" },
    { label: "封禁中", value: stats.suspended, hint: "SUSPENDED", href: "/admin/users" },
    { label: "待审文章", value: stats.pendingPosts, href: "/admin/moderation" },
    { label: "待审评论", value: stats.pendingComments, href: "/admin/moderation" },
    { label: "阻断记录", value: stats.blocked, hint: "待处置", href: "/admin/moderation" },
    { label: "生效公告", value: stats.activeAnnouncements, hint: `共 ${stats.announcements} 条`, href: "/admin/announcements" },
    { label: "认证称号", value: stats.badges, hint: "已启用", href: "/admin/users" },
    { label: "文章总数", value: stats.posts, href: "/admin/moderation" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">概览</h1>
        <p className="mt-1 text-xs" style={{ color: "#8a92b8" }}>
          用户端实时数据 · {new Date(stats.now).toLocaleString("zh-CN")}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map((c) => {
          const inner = (
            <>
              <p className="text-2xl font-semibold tabular-nums" style={{ color: "#97a2ff" }}>
                {typeof c.value === "number" ? c.value.toLocaleString("zh-CN") : c.value}
              </p>
              <p className="mt-1 text-xs" style={{ color: "#aab2e0" }}>{c.label}</p>
              {c.hint && <p className="text-[10px]" style={{ color: "#5f6a96" }}>{c.hint}</p>}
            </>
          );
          return c.href ? (
            <Link
              key={c.label}
              href={c.href}
              className="rounded-[var(--radius)] p-4 transition-colors hover:brightness-110"
              style={{ backgroundColor: "rgba(22,30,66,0.7)", border: "1px solid rgba(125,140,255,0.14)" }}
            >
              {inner}
            </Link>
          ) : (
            <div key={c.label} className="rounded-[var(--radius)] p-4" style={{ backgroundColor: "rgba(22,30,66,0.7)", border: "1px solid rgba(125,140,255,0.14)" }}>
              {inner}
            </div>
          );
        })}
      </div>

      <section className="rounded-[var(--radius)] p-5" style={{ backgroundColor: "rgba(22,30,66,0.7)", border: "1px solid rgba(125,140,255,0.14)" }}>
        <h2 className="text-sm font-semibold">安全边界</h2>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed" style={{ color: "#aab2e0" }}>
          <li>· 管理端与用户端会话完全隔离（独立 Cookie 与会话表），用户端无法触达任何管理功能</li>
          <li>· 管理登录需双因子：管理员密码 + 服务器下发密钥（ADMIN_ACCESS_KEY）</li>
          <li>· 封禁即时生效：用户状态置 SUSPENDED 并吊销其全部用户会话</li>
          <li>· 管理端所有操作经 requireAdmin 守卫并记录审计日志</li>
        </ul>
      </section>
    </div>
  );
}
