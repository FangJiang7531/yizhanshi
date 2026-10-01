"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp } from "lucide-react";

/**
 * 回到顶部（优化文档 §6.4）：滚动超过 1.5 屏后淡入，
 * 固定于右下 24px，40×40 圆形；点击平滑回顶。
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setVisible(window.scrollY > window.innerHeight * 1.5);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          aria-label="回到顶部"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-24 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full md:bottom-6"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            color: "var(--color-text-secondary)",
            boxShadow: "var(--shadow-md)",
            border: "1px solid color-mix(in srgb, var(--color-border) 40%, transparent)",
          }}
        >
          <ArrowUp size={17} aria-hidden />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
