import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { ModulePageHeader } from "@/components/layout/module-page-header";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { LinksBoard } from "@/modules/links/components/links-board";

export const dynamic = "force-dynamic";

export const metadata = { title: "短链 · 个人数字工作台" };

/** 短链板块主页：网址缩短 + 文件/图片分享短链 + 点击统计（受管理端功能开关控制） */
export default async function LinksPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");

  const feature = await isFeatureEnabled("links");
  if (!feature.enabled) {
    return (
      <div className="space-y-5">
        <ModulePageHeader title="短链" subtitle="网址缩短、文件分享、自定义别名、二维码与点击统计" />
        <div className="card p-10 text-center">
          <p className="text-base font-semibold">「短链」功能维护中</p>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
            {feature.disabledReason ?? "管理员已临时停用该功能，请稍后再来。"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ModulePageHeader
        title="短链"
        subtitle="网址缩短、文件分享、自定义别名、二维码与点击统计"
      />
      {"guest" in principal ? (
        <div className="card p-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
          访客模式下短链不可用，注册账号即可创建属于你的短链。
        </div>
      ) : (
        <LinksBoard />
      )}
    </div>
  );
}
