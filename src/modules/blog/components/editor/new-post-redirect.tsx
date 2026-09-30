"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import { createDraftAction } from "../../actions/post.actions";

/**
 * 新建文章跳板：挂载后创建空白草稿 → 跳转 `/blog/[id]/edit`。
 * runningRef 守卫防 StrictMode 的 effect 双调用（否则会创建两篇草稿）。
 * 失败（如限流）时展示错误与重试，而不是静默停在空白页。
 */
export function NewPostRedirect() {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const runningRef = useRef(false);

  useEffect(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    void createDraftAction().then((res) => {
      runningRef.current = false;
      if (res.success) {
        router.replace(`/blog/${res.data.id}/edit`);
      } else {
        setError(res.error.message);
        toast("error", res.error.message);
      }
    });
  }, [attempt, router, toast]);

  return (
    <div className="flex h-[40vh] flex-col items-center justify-center gap-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
      {error ? (
        <>
          <p style={{ color: "var(--color-danger)" }}>{error}</p>
          <button
            type="button"
            className="btn btn-primary text-xs"
            onClick={() => {
              setError(null);
              setAttempt((v) => v + 1);
            }}
          >
            重试
          </button>
        </>
      ) : (
        <>
          <Loader2 size={20} className="animate-spin" />
          <p>正在创建草稿…</p>
        </>
      )}
    </div>
  );
}
