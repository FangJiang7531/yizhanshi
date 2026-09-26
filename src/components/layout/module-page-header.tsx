import type { ReactNode } from "react";

/**
 * 板块页头：每个板块有自己的标题与副标题，营造「独立小站点」的页码感
 * （PRD §3.3 规则 2），但颜色一律走语义变量，保证风格统一。
 */
export function ModulePageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[30px] font-semibold leading-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
