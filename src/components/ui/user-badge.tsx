"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * 认证称号展示组件（管理端发放）：
 * - BadgeChip：昵称后的方框称号（自定义文字/文字色/背景色）；
 * - AvatarSStrip：头像右下角的横向 S 角标（认证持有者标记）；
 * - BadgeAuthorName：昵称 + 称号的一体化展示（评论区/名片复用）。
 */

export type BadgeData = { text: string; color: string; bgColor: string | null } | null | undefined;

/** 方框称号（跟随昵称展示） */
export function BadgeChip({ badge, fontSize = 11 }: { badge: BadgeData; fontSize?: number }) {
  if (!badge) return null;
  const style: CSSProperties = {
    color: badge.color,
    border: `1px solid ${badge.color}`,
    backgroundColor: badge.bgColor ?? "transparent",
    fontSize,
    lineHeight: 1.5,
    padding: "0 5px",
    borderRadius: 4,
    fontWeight: 600,
    whiteSpace: "nowrap",
    display: "inline-block",
    verticalAlign: "baseline",
  };
  return <span style={style}>{badge.text}</span>;
}

/** 昵称 + 称号 */
export function BadgeAuthorName({
  name,
  badge,
  className,
  style,
}: {
  name: string;
  badge: BadgeData;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, ...style }}>
      <span className="truncate">{name}</span>
      <BadgeChip badge={badge} />
    </span>
  );
}

/** 头像右下角横向 S 角标（仅认证用户） */
export function AvatarSStrip({ badge, size = 14 }: { badge: BadgeData; size?: number }) {
  if (!badge) return null;
  return (
    <span
      aria-label="认证用户"
      title="认证用户"
      style={{
        position: "absolute",
        right: -2,
        bottom: -2,
        width: size,
        height: Math.round(size * 0.62),
        borderRadius: 4,
        background: `linear-gradient(135deg, ${badge.color}, ${badge.bgColor ?? "#0d1026"})`,
        border: `1.5px solid ${badge.color}`,
        color: "#fff",
        fontSize: Math.round(size * 0.5),
        fontWeight: 800,
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-sans)",
        letterSpacing: "-0.5px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
        pointerEvents: "none",
      }}
    >
      S
    </span>
  );
}

/** 包裹头像：认证用户自动叠加 S 角标 */
export function WithSStrip({ badge, children }: { badge: BadgeData; children: ReactNode }) {
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      {children}
      <AvatarSStrip badge={badge} />
    </span>
  );
}
