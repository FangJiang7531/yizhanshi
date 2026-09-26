"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

/** 平台区错误边界：可读文案 + 重试入口，不暴露堆栈 */
export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 错误详情仅进服务端/控制台日志，不渲染给用户
    console.error("[platform-error]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)]"
        style={{ backgroundColor: "var(--color-bg-elevated)", color: "var(--color-danger)" }}
        aria-hidden
      >
        <AlertTriangle size={24} />
      </div>
      <h1 className="mt-4 text-lg font-semibold">页面出了点问题</h1>
      <p className="mt-1 max-w-sm text-sm" style={{ color: "var(--color-text-secondary)" }}>
        发生了意外错误，你的数据不受影响。可以尝试重新加载；若持续出现请反馈。
      </p>
      <button type="button" className="btn btn-primary mt-5" onClick={reset}>
        <RotateCcw size={15} />
        重新加载
      </button>
    </div>
  );
}
