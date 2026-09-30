"use client";

import { useEffect, useState } from "react";

/**
 * 阅读进度条（PRD §5.4：顶部 3px，随滚动填充，使用 --color-primary）。
 *
 * 进度按**正文容器**计算而不是整个文档：文章前后还有作者卡、相关文章、
 * 评论区，用文档高度会让进度条在正文读完后仍然只走一半，与"读到哪了"不符。
 *
 * 用 rAF 节流：scroll 事件在移动端可达每秒上百次，直接 setState 会造成
 * 每秒上百次重渲染。这里把状态更新压到每帧一次。
 */
export function ReadingProgress({ targetId }: { targetId: string }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = target.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      // 正文比视口还短时直接算读完，避免出现"永远到不了 100%"
      if (total <= 0) {
        setProgress(1);
        return;
      }
      const scrolled = -rect.top;
      setProgress(Math.min(1, Math.max(0, scrolled / total)));
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [targetId]);

  return (
    <div aria-hidden className="fixed inset-x-0 top-0 z-40 h-[3px]" style={{ pointerEvents: "none" }}>
      <div
        className="h-full transition-[width] duration-100 ease-out"
        style={{ width: `${progress * 100}%`, backgroundColor: "var(--color-primary)" }}
      />
    </div>
  );
}
