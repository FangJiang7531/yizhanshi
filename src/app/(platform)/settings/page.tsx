import { getPrincipal } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ModulePageHeader } from "@/components/layout/module-page-header";
import { AppearanceSection } from "@/components/layout/settings-appearance";
import {
  PreferencesSection,
  NotificationsSection,
} from "@/components/layout/settings-preferences";
import { APP_VERSION, CHANGELOG } from "@/config/version";

/**
 * 设置页（PRD §7.7）。
 * 本期可用分区：外观、偏好、通知、关于；
 * 个人资料与账号安全展示但标注「即将开放」。
 */
export default async function SettingsPage() {
  const principal = await getPrincipal();
  const isGuest = principal !== null && "guest" in principal;

  const setting =
    principal && "user" in principal
      ? await prisma.userSetting.findUnique({
          where: { userId: principal.user.id },
        })
      : null;

  const timezone =
    principal && "user" in principal ? principal.user.timezone : "Asia/Shanghai";

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="设置"
        subtitle={isGuest ? "访客模式的设置只保存在本机浏览器" : "设置会自动保存到你的账号"}
      />

      <div className="card p-6">
        <AppearanceSection />
      </div>

      {!isGuest && (
        <>
          <div className="card p-6">
            <SectionTitle title="偏好" hint="时区影响问候语与“今日”统计口径" />
            <PreferencesSection
              timezone={timezone}
              weekStartDay={setting?.weekStartDay ?? 1}
              locale={setting?.locale ?? "zh-CN"}
            />
          </div>

          <div className="card p-6">
            <SectionTitle title="通知" hint="本期仅保存偏好，实际推送在后续阶段开放" />
            <NotificationsSection
              notifyEmail={setting?.notifyEmail ?? false}
              reminderTime={setting?.reminderTime ?? null}
            />
          </div>
        </>
      )}

      <div className="card p-6">
        <SectionTitle title="关于" />
        <div className="space-y-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          <p>
            版本：<span style={{ color: "var(--color-text-primary)" }}>{APP_VERSION}</span>
          </p>
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="mt-3">
              <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                v{entry.version}（{entry.date}）
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <UpcomingCard
          title="个人资料"
          items={["头像", "显示昵称", "用户名（只读）", "邮箱"]}
        />
        <UpcomingCard
          title="账号安全"
          items={["修改密码", "登出全部设备", "活跃会话列表"]}
        />
      </div>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint ? (
        <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function UpcomingCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <span
          className="rounded-full px-2 py-0.5 text-[10px]"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            color: "var(--color-text-muted)",
            border: "1px solid var(--color-border)",
          }}
        >
          即将开放
        </span>
      </div>
      <ul className="space-y-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
