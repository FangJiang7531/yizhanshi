"use client";

import { Moon, Sun } from "lucide-react";
import { useRef } from "react";
import { useTheme } from "./theme-provider";
import type { ColorMode } from "@/lib/theme/tokens";

/**
 * 白天/黑夜快捷切换（顶栏）——核心需求：从按钮位置圆形扩散，不是生硬切换。
 * ① 取按钮中心点 ② 计算覆盖全屏半径 ③ View Transitions 可用时对
 * ::view-transition-new(root) 做 clip-path circle 扩散（400ms ease-out）
 * ④ 不支持时降级为瞬时切换 ⑤ prefers-reduced-motion / 关闭动效设置 → 瞬时切换。
 */
export function ThemeToggle() {
  const { colorMode, setMode, motionEnabled } = useTheme();
  const btnRef = useRef<HTMLButtonElement>(null);

  const nextMode: ColorMode = colorMode === "dark" ? "light" : "dark";
  const resolvedNow = colorMode === "dark" ? "dark" : "light";

  function applyMode(mode: ColorMode) {
    setMode(mode);
  }

  function handleClick() {
    const reduceMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches || !motionEnabled;

    if (reduceMotion || !document.startViewTransition) {
      applyMode(nextMode); // 降级：瞬时切换
      return;
    }

    const rect = btnRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const transition = document.startViewTransition(() => applyMode(nextMode));
    void transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`],
        },
        {
          duration: 400,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });
  }

  return (
    <button
      ref={btnRef}
      type="button"
      className="icon-btn"
      onClick={handleClick}
      aria-label={resolvedNow === "dark" ? "切换到浅色模式" : "切换到深色模式"}
      title={resolvedNow === "dark" ? "切换到浅色模式" : "切换到深色模式"}
    >
      {resolvedNow === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
