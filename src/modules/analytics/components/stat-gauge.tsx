"use client";

import { useEffect, useState } from "react";

/**
 * 环形进度仪表（总览仪表盘核心组件）。
 * SVG 双环：底环为轨道，前环为进度；进度变化时以 CSS transition 平滑过渡，
 * 数字采用滚动递增动画，让“数据变化”本身成为可感知的动效。
 */
export function StatRing({
  value,
  total,
  size = 108,
  stroke = 9,
  label,
  color,
}: {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  label: string;
  /** 进度色；缺省用主题主色 */
  color?: string;
}) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [shownPct, setShownPct] = useState(0);
  const [shownValue, setShownValue] = useState(0);

  // 首帧后过渡到真实值（触发 CSS transition / 数字滚动）
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      setShownPct(pct);
      setShownValue(value);
    });
    return () => cancelAnimationFrame(t);
  }, [pct, value]);

  return (
    <div className="flex flex-col items-center gap-1.5" role="img" aria-label={`${label}：${value} / ${total}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* 轨道环：主色 10% 底色，与背景平滑融合 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="color-mix(in srgb, var(--color-primary) 10%, transparent)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color ?? "var(--color-primary)"}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - shownPct)}
            style={{ transition: "stroke-dashoffset 900ms var(--ease-out)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums" style={{ color: color ?? "var(--color-primary)" }}>
            {shownValue}
            <span className="text-sm font-normal" style={{ color: "var(--color-text-muted)" }}>
              {" "}
              / {total}
            </span>
          </span>
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            {Math.round(pct * 100)}%
          </span>
        </div>
      </div>
      <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </span>
    </div>
  );
}

/**
 * 线性进度条（列表内嵌场景）：轨道与进度条都用半透明色，与卡片背景平滑过渡。
 */
export function ProgressBar({
  value,
  total,
  color,
  height = 6,
  label,
}: {
  value: number;
  total: number;
  color?: string;
  height?: number;
  label?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(t);
  }, [pct]);

  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, backgroundColor: "color-mix(in srgb, var(--color-primary) 10%, transparent)" }}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={label ?? "进度"}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${shown}%`,
          background: `linear-gradient(90deg, color-mix(in srgb, ${color ?? "var(--color-primary)"} 82%, transparent), ${color ?? "var(--color-primary)"})`,
          transition: "width 900ms var(--ease-out)",
        }}
      />
    </div>
  );
}
