import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getModuleMeta } from "@/config/modules";

/**
 * 板块页头：自动按当前路由取模块品牌色与图标，渲染渐变图标章，
 * 营造「独立小站点」的页码感（PRD §3.3 规则 2）；
 * 颜色一律走语义变量 + 模块品牌色，保证多主题下风格统一。
 */
export async function ModulePageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  const mod = getModuleMeta(pathname);
  const accent = mod?.accent ?? "#6366F1";
  const Icon = mod?.icon;

  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon && (
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius)]"
            style={{
              background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 88%, #ffffff12), color-mix(in srgb, ${accent} 55%, var(--color-bg-surface)))`,
              color: "#ffffff",
              boxShadow: `0 6px 18px color-mix(in srgb, ${accent} 28%, transparent)`,
            }}
            aria-hidden
          >
            <Icon size={22} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[28px] font-semibold leading-tight">{title}</h1>
          {subtitle ? (
            <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
