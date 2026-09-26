import { getPrincipal } from "@/lib/auth/session";
import { ModulePageHeader } from "@/components/layout/module-page-header";

/**
 * 总览页（M6 完整实现）。
 * M2 阶段为临时占位，用于验证外壳、认证与会话链路。
 */
export default async function DashboardPage() {
  const principal = await getPrincipal();
  const isGuest = principal !== null && "guest" in principal;
  const name =
    principal === null
      ? "未登录"
      : isGuest
        ? principal.guest.displayName
        : (principal.user.displayName ?? principal.user.username);

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="总览"
        subtitle={`欢迎，${name}${isGuest ? "（访客模式 · 只读）" : ""}`}
      />
      <div className="card p-6 text-sm" style={{ color: "var(--color-text-secondary)" }}>
        平台外壳与认证链路已打通。任务清单、习惯打卡、统计聚合将在后续里程碑接入。
      </div>
    </div>
  );
}
