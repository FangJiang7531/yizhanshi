"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { daysOfMonth, weekdayOf } from "@/lib/date/timezone";

/**
 * 当月热力图（自研 SVG，PRD §5.2.2）：
 * 7 列（周一至周日）× N 行；有打卡 = 习惯色实色，无 = 浅底；
 * 今天描边高亮；悬停 Tooltip 显示「M月D日 · 已打卡/未打卡」；
 * role="img" + aria-label。
 */
export function HabitHeatmap({
  monthDates,
  today,
  color,
}: {
  monthDates: Set<string>;
  today: string;
  color: string;
}) {
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null);
  const days = daysOfMonth(today);
  const cell = 13;
  const gap = 3;
  const firstDay = days[0] ?? today;
  const maxWeek = Math.ceil((days.length + firstOffset(firstDay)) / 7);
  const width = 7 * (cell + gap) - gap;
  const height = maxWeek * (cell + gap) - gap;

  function firstOffset(day: string): number {
    // 周一为第一列：weekday 0(日)→6, 1(一)→0 … 6(六)→5
    const wd = weekdayOf(day);
    return (wd + 6) % 7;
  }

  const offset = firstOffset(firstDay);

  return (
    <div className="relative">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`当月热力图：共 ${monthDates.size} 天打卡`}
        onMouseLeave={() => setHover(null)}
      >
        {days.map((d, i) => {
          const col = (offset + i) % 7;
          const row = Math.floor((offset + i) / 7);
          const filled = monthDates.has(d);
          const isToday = d === today;
          return (
            <rect
              key={d}
              x={col * (cell + gap)}
              y={row * (cell + gap)}
              width={cell}
              height={cell}
              rx={3}
              fill={filled ? color : "var(--color-bg-elevated)"}
              stroke={isToday ? "var(--color-text-primary)" : "none"}
              strokeWidth={isToday ? 1.5 : 0}
              opacity={filled || isToday ? 1 : 0.9}
              style={{ transition: "fill var(--duration-base) var(--ease-out)" }}
              onMouseEnter={(e) => {
                const rect = (e.target as SVGRectElement).getBoundingClientRect();
                setHover({
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                  label: `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日 · ${filled ? "已打卡" : "未打卡"}`,
                });
              }}
            />
          );
        })}
      </svg>
      {hover &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[90] -translate-x-1/2 -translate-y-full rounded-[var(--radius-sm)] px-2 py-1 text-xs"
            style={{
              left: hover.x,
              top: hover.y - 6,
              backgroundColor: "var(--color-bg-elevated)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border)",
              boxShadow: "var(--shadow-md)",
            }}
            role="status"
          >
            {hover.label}
          </div>,
          document.body,
        )}
    </div>
  );
}
