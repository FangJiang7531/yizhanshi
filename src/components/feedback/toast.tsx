"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };

/**
 * Toast 服务。
 * 对外同时提供两种等价用法：
 *   const toast = useToast();  toast.success("已保存");
 *   const { toast } = useToast();  toast("success", "已保存");
 *
 * 无障碍：成功用 role=status（3s 自动淡出），失败用 role=alert（5s 或手动关闭）。
 */
export type ToastApi = {
  (kind: ToastKind, message: string): void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId++;
      setToasts((list) => [...list, { id, kind, message }]);
      window.setTimeout(() => remove(id), kind === "error" ? 5000 : 3000);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(() => {
    const fn = ((kind: ToastKind, message: string) => push(kind, message)) as ToastApi;
    fn.success = (message: string) => push("success", message);
    fn.error = (message: string) => push("error", message);
    fn.info = (message: string) => push("info", message);
    return fn;
  }, [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed left-1/2 top-4 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className="toast-in pointer-events-auto flex items-start gap-2 rounded-[var(--radius)] border px-3 py-2.5 text-sm"
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

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必须在 ToastProvider 内使用");
  return ctx;
}
