"use client";

import { useEffect } from "react";

/**
 * 手机端滚动回弹（rubber-band）：
 * 页面滚到顶部继续下拉 / 滚到底部继续上拉时，对内容根节点施加小位移，
 * 松手后以弹性缓动回弹。iOS Safari 原生自带橡皮筋，本 hook 补齐 Android/桌面触屏体验；
 * prefers-reduced-motion 用户与不可滚动页面自动跳过（避免短页面出现「无尽下滑」观感）。
 */
export function useRubberBand(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("ontouchstart" in window)) return; // 仅触屏设备

    let startY: number | null = null;
    let pulling: "top" | "bottom" | null = null;
    let raf = 0;

    function target(): HTMLElement | null {
      return document.getElementById("rubber-band-root");
    }
    /** 页面是否可滚动（不可滚动时不回弹，防止位移残留被误读为还能继续滑） */
    function scrollable(): boolean {
      return document.documentElement.scrollHeight - window.innerHeight > 8;
    }
    function apply(offset: number) {
      const el = target();
      if (!el) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = offset !== 0 ? `translateY(${offset}px)` : "";
        el.style.transition = offset !== 0 ? "none" : "transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1)";
      });
    }
    function reset() {
      startY = null;
      pulling = null;
      apply(0);
    }

    function onTouchStart(e: TouchEvent) {
      startY = e.touches[0]?.clientY ?? null;
      pulling = null;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY === null || !scrollable()) return;
      const y = e.touches[0]?.clientY ?? 0;
      const delta = y - startY;
      const atTop = window.scrollY <= 0;
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;

      if (!pulling) {
        if (atTop && delta > 12) pulling = "top";
        else if (atBottom && delta < -12) pulling = "bottom";
        else return;
      }
      if (pulling === "top" && !atTop) return reset();
      if (pulling === "bottom" && !atBottom) return reset();
      // 阻尼限幅：位移越大越难拉
      apply(Math.max(-60, Math.min(60, delta * 0.3)));
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", reset);
    window.addEventListener("touchcancel", reset);
    // 切后台/旋转等异常路径兜底复位，杜绝 transform 残留
    document.addEventListener("visibilitychange", reset);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", reset);
      window.removeEventListener("touchcancel", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [enabled]);
}

