import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getModuleMeta } from "@/config/modules";

/**
 * 板块页头（无界化重构）：图标章从「重渐变 + 投影」改为「板块色浅底 + 板块色图标」
 * 的双色轻量风——识别度不依赖装饰重量，而依赖板块专属色；
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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)]"
            style={{
              backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`,
              color: accent,
            }}
            aria-hidden
          >
            <Icon size={21} strokeWidth={1.8} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-semibold leading-tight tracking-[-0.01em]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
