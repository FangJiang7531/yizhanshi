"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 对话框底层：遮罩淡入 + 内容 scale(0.96)→1（220ms）；关闭反向（180ms）。
 * Esc 关闭；移动端转为底部抽屉。焦点移入对话框并在关闭时归还。
 *
 * 关键实现约束：onClose 等回调经 ref 读取，effect 只依赖 `open` ——
 * 否则父组件每次重渲染（如输入框逐字输入）都会重跑本 effect，
 * 抢走正在输入的焦点（表现为“打一个字就停止输入”）。
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      // 优先聚焦文本输入控件，而非第一个按钮
      panelRef.current
        ?.querySelector<HTMLElement>("input, textarea, select")
        ?.focus();
    }, 50);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      window.clearTimeout(focusTimer);
      prevFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "rgba(0,0,0,0.45)",
          animation: "content-in var(--duration-base) var(--ease-out)",
        }}
        onClick={() => onCloseRef.current()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className="pop-in relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-lg)]"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-lg)",
          maxWidth: wide ? 640 : 480,
        }}
      >
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onCloseRef.current()}
            aria-label="关闭对话框"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t px-5 py-3.5">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
