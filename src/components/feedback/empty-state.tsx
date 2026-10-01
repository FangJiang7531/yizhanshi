import type { ReactNode } from "react";

/** 空状态：插画（内联 SVG，主题语义色）+ 文案 + 引导按钮（呼吸光晕）
 *  人格化（优化文档 §4.1 维度⑥）：每个板块有自己的语气与插画 ——
 *  tasks 中性 / habits 引导 / blog 幽默 / generic 中性。 */
export function EmptyState({
  title,
  description,
  action,
  compact,
  kind = "tasks",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  kind?: "tasks" | "habits" | "blog" | "generic";
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-8" : "py-16"}`}>
      {!compact && (
        <EmptyIllustration kind={kind} />
      )}
      <p className="mt-3 text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
        {title}
      </p>
      {description && (
        <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
          {description}
        </p>
      )}
      {action && <div className="breathe mt-4 rounded-[var(--radius)]">{action}</div>}
    </div>
  );
}

function EmptyIllustration({ kind }: { kind: "tasks" | "habits" | "blog" | "generic" }) {
  const stroke = "var(--color-text-muted)";
  const primary = "var(--color-primary)";
  return (
    <svg width="120" height="88" viewBox="0 0 120 88" fill="none" aria-hidden="true" className="opacity-80">
      {kind === "tasks" && (
        <>
          <rect x="18" y="12" width="84" height="64" rx="8" stroke={stroke} strokeWidth="2" />
          <circle cx="34" cy="32" r="7" stroke={primary} strokeWidth="2" />
          <path d="M31 32l2.5 2.5L38 29.5" stroke={primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M48 32h36" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <circle cx="34" cy="52" r="7" stroke={stroke} strokeWidth="2" />
          <path d="M48 52h24" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        </>
      )}
      {kind === "habits" && (
        <>
          <rect x="24" y="18" width="72" height="52" rx="8" stroke={stroke} strokeWidth="2" />
          <path
            d="M32 52c6-10 10-2 14-8s8-14 14-6 8 12 14 4 10-8 14-2"
            stroke={primary}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="88" cy="30" r="6" stroke={primary} strokeWidth="2" />
        </>
      )}
      {kind === "blog" && (
        <>
          {/* 一支搁浅的笔 + 空稿纸：幽默型“笔都凉了” */}
          <rect x="26" y="14" width="68" height="56" rx="8" stroke={stroke} strokeWidth="2" />
          <path d="M38 30h44M38 42h30" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          <path
            d="M86 66l14-14a4.2 4.2 0 0 1 6 6l-14 14-8 2z"
            stroke={primary}
            strokeWidth="2"
            strokeLinejoin="round"
            fill="none"
          />
          <path d="M98 54l4 4" stroke={primary} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {kind === "generic" && (
        <>
          <rect x="30" y="20" width="60" height="48" rx="8" stroke={stroke} strokeWidth="2" />
          <path d="M44 38h32M44 50h20" stroke={primary} strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** 骨架屏块 */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className ?? ""}`} style={style} aria-hidden="true" />;
}
