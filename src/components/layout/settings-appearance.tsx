"use client";

import { Check } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { THEMES, type ColorMode, type ThemeName } from "@/lib/theme/tokens";
import { useToast } from "@/components/feedback/toast";

/**
 * 外观设置分区（PRD §7.7）。
 * 硬性要求：改完立即生效，无需点保存；主题以可视化卡片预览，卡片本身用该主题配色渲染。
 * 已登录写 UserSetting，访客写 localStorage（由 ThemeProvider 统一处理）。
 */
export function AppearanceSection() {
  const { themeName, setTheme, colorMode, setMode, motionEnabled, setMotion } = useTheme();
  const toast = useToast();

  const modes: { id: ColorMode; label: string }[] = [
    { id: "light", label: "浅色" },
    { id: "dark", label: "深色" },
    { id: "system", label: "跟随系统" },
  ];

  return (
    <div className="space-y-8">
      {/* 主题选择 */}
      <section>
        <SectionTitle title="主题" hint="6 套配色方案，每套都手写了浅色与深色两版" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {THEMES.map((t) => {
            const selected = themeName === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTheme(t.id as ThemeName);
                  toast("success", `已切换到「${t.name}」`);
                }}
                aria-pressed={selected}
                className="group relative overflow-hidden rounded-[var(--radius)] border-2 p-0 text-left transition-all"
                style={{
                  borderColor: selected ? "var(--color-primary)" : "var(--color-border)",
                }}
              >
                {/* 卡片用该主题自身的配色渲染 */}
                <span
                  className="flex h-20 flex-col justify-between p-3"
                  style={{ backgroundColor: t.swatch.bg, color: t.swatch.fg }}
                  aria-hidden
                >
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold"
                    style={{ backgroundColor: t.swatch.accent, color: t.swatch.bg }}
                  >
                    Aa
                  </span>
                  <span className="flex gap-1">
                    <span className="h-1.5 w-8 rounded-full" style={{ backgroundColor: t.swatch.accent }} />
                    <span className="h-1.5 w-5 rounded-full" style={{ backgroundColor: t.swatch.fg, opacity: 0.35 }} />
                  </span>
                </span>
                <span
                  className="flex items-center justify-between px-3 py-2 text-xs font-medium"
                  style={{
                    backgroundColor: "var(--color-bg-surface)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  {t.name}
                  {selected && <Check size={13} style={{ color: "var(--color-primary)" }} />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 明暗模式 */}
      <section>
        <SectionTitle title="明暗模式" hint="切换时使用从按钮位置扩散的圆形动效" />
        <div
          className="inline-flex rounded-[var(--radius)] p-1"
          style={{ backgroundColor: "var(--color-bg-elevated)" }}
          role="radiogroup"
          aria-label="明暗模式"
        >
          {modes.map((m) => {
            const selected = colorMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(m.id)}
                className="rounded-[var(--radius-sm)] px-4 py-1.5 text-sm transition-colors"
                style={{
                  backgroundColor: selected ? "var(--color-bg-surface)" : "transparent",
                  color: selected ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  fontWeight: selected ? 600 : 400,
                  boxShadow: selected ? "var(--shadow-sm)" : "none",
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 动效开关 */}
      <section>
        <SectionTitle title="界面动效" hint="关闭后所有过渡退化为瞬时，功能不受影响" />
        <label className="flex cursor-pointer items-center gap-3">
          <span
            className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
            style={{ backgroundColor: motionEnabled ? "var(--color-primary)" : "var(--color-border)" }}
          >
            <input
              type="checkbox"
              className="peer sr-only"
              checked={motionEnabled}
              onChange={(e) => setMotion(e.target.checked)}
            />
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
              style={{ transform: motionEnabled ? "translateX(22px)" : "translateX(2px)" }}
              aria-hidden
            />
          </span>
          <span className="text-sm">{motionEnabled ? "已启用" : "已关闭"}</span>
        </label>
      </section>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint ? (
        <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
