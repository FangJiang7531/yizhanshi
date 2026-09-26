"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

const ToastContext = createContext<{
  toast: (kind: ToastKind, message: string) => void;
} | null>(null);

let nextId = 1;

/** Toast：成功 role=status 3 秒自动淡出；失败 role=alert 5 秒或手动关闭 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId++;
      setToasts((list) => [...list, { id, kind, message }]);
      window.setTimeout(() => remove(id), kind === "error" ? 5000 : 3000);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed left-1/2 top-4 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className="toast-in flex items-start gap-2 rounded-[var(--radius)] border px-3 py-2.5 text-sm"
            style={{
              backgroundColor: "var(--color-bg-elevated)",
              borderColor:
                t.kind === "error"
                  ? "var(--color-danger)"
                  : t.kind === "success"
                    ? "var(--color-success)"
                    : "var(--color-border)",
              color: "var(--color-text-primary)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            {t.kind === "success" ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: "var(--color-success)" }} />
            ) : t.kind === "error" ? (
              <AlertCircle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--color-danger)" }} />
            ) : (
              <Info size={16} className="mt-0.5 shrink-0" style={{ color: "var(--color-info)" }} />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              className="icon-btn !h-5 !w-5 shrink-0"
              aria-label="关闭提示"
              onClick={() => remove(t.id)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必须在 ToastProvider 内使用");
  return ctx;
}
