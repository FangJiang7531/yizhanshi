"use client";

import { useCallback, useEffect, useState } from "react";
import { ListTree } from "lucide-react";
import type { TocItemDTO } from "../types";

/**
 * 目录（PRD §5.4）：桌面右侧悬浮 sticky 200px + 滚动高亮；移动端折叠为顶部下拉。
 *
 * 高亮策略用**滚动位置计算**而不是 IntersectionObserver：
 * IO 在"多个标题同时可见"时无法表达"当前章节"的单一性，需要额外维护可见集合与
 * 排序规则；而"取最后一个已越过基准线的标题"在语义上正好就是读者当前所在章节，
 * 实现更短也更稳定。
 *
 * 基准线取 88px（顶栏 56px + 一点余量），保证标题刚被顶栏遮住时就切到下一节。
 */
const ACTIVE_LINE = 88;

export function TableOfContents({ items }: { items: TocItemDTO[] }) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");
  const [openMobile, setOpenMobile] = useState(false);

  useEffect(() => {
    if (items.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = items[0]!.id;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= ACTIVE_LINE) current = item.id;
        else break; // 标题按文档顺序排列，遇到第一个未越过的即可停止
      }
      setActiveId(current);
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
  }, [items]);

  const go = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    // 不写 hash 会丢失"可复制章节链接"的能力；用 replaceState 避免污染历史栈
    window.history.replaceState(null, "", `#${id}`);
    setActiveId(id);
    setOpenMobile(false);
  }, []);

  if (items.length < 2) return null;

  return (
    <>
      {/* 移动端：折叠下拉 */}
      <div className="lg:hidden">
        <button
          type="button"
          className="btn btn-outline btn-sm w-full !justify-between"
          aria-expanded={openMobile}
          onClick={() => setOpenMobile((v) => !v)}
        >
          <span className="inline-flex items-center gap-1.5">
            <ListTree size={14} aria-hidden />
            目录
          </span>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {openMobile ? "收起" : `${items.length} 节`}
          </span>
        </button>
        {openMobile && (
          <nav aria-label="文章目录" className="pop-in mt-2 rounded-[var(--radius)] border p-2">
            <TocList items={items} activeId={activeId} onSelect={go} />
          </nav>
        )}
      </div>

      {/* 桌面：右侧悬浮 sticky */}
      <nav
        aria-label="文章目录"
        className="sticky top-[88px] hidden max-h-[calc(100vh-120px)] w-[200px] shrink-0 overflow-y-auto lg:block"
      >
        <p
          className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em]"
          style={{ color: "var(--color-text-muted)" }}
        >
          目录
        </p>
        <TocList items={items} activeId={activeId} onSelect={go} />
      </nav>
    </>
  );
}

function TocList({
  items,
  activeId,
  onSelect,
}: {
  items: TocItemDTO[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={active ? "location" : undefined}
              className="flex w-full items-start gap-2 rounded-[var(--radius-sm)] py-1 text-left text-[13px] leading-snug transition-colors"
              style={{
                paddingLeft: item.depth === 3 ? 20 : 8,
                paddingRight: 6,
                color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
                fontWeight: active ? 600 : 400,
                backgroundColor: active
                  ? "color-mix(in srgb, var(--color-primary) 8%, transparent)"
                  : "transparent",
              }}
            >
              <span
                aria-hidden
                className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full transition-colors"
                style={{
                  backgroundColor: active ? "var(--color-primary)" : "var(--color-text-muted)",
                }}
              />
              <span className="line-clamp-2">{item.text}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
