"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

/**
 * 实时预览面板（PRD §5.2.3）。
 *
 * 渲染经服务端 /api/blog/render-preview —— 与发布共用同一条 renderMarkdown 管线
 * （净化 / 高亮 / 卡片 / TOC 与最终阅读体验一致）。html 已经过 rehype-sanitize，
 * 与详情页的信任模型相同，故用 dangerouslySetInnerHTML 注入。
 *
 * 输入 debounce 500ms 请求一次；请求带序号防竞态（慢响应不得覆盖新响应）。
 */

const DEBOUNCE_MS = 500;

export function PreviewPane({
  contentMd,
  containerRef,
  className,
}: {
  contentMd: string;
  containerRef?: RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const [html, setHtml] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const seqRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);

  const render = useCallback(async (md: string) => {
    const seq = ++seqRef.current;
    setPhase("loading");
    try {
      const res = await fetch("/api/blog/render-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentMd: md }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { html?: string };
      if (seq !== seqRef.current) return;
      setHtml(data.html ?? "");
      setPhase("ready");
    } catch {
      if (seq !== seqRef.current) return;
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void render(contentMd), DEBOUNCE_MS);
    return () => window.clearTimeout(timerRef.current);
  }, [contentMd, render]);

  return (
    <div className={`flex min-h-0 min-w-0 flex-col ${className ?? ""}`}>
      <div
        className="flex h-8 shrink-0 items-center justify-end gap-1.5 border-b px-3 text-xs"
        style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
      >
        {phase === "loading" && (
          <>
            <Loader2 size={12} className="animate-spin" />
            <span>渲染中…</span>
          </>
        )}
        {phase === "ready" && <span>预览已更新</span>}
        {phase === "error" && (
          <>
            <AlertCircle size={12} style={{ color: "var(--color-danger)" }} />
            <span style={{ color: "var(--color-danger)" }}>预览渲染失败</span>
            <button
              type="button"
              className="inline-flex items-center gap-0.5 underline underline-offset-2"
              onClick={() => void render(contentMd)}
            >
              <RefreshCw size={11} />
              重试
            </button>
          </>
        )}
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto">
        {html ? (
          <article
            className="blog-prose mx-auto w-full max-w-[720px] px-6 py-6"
            // 已由服务端 rehype-sanitize 净化（与详情页同一信任模型）
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          phase !== "loading" && (
            <p className="px-6 py-10 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
              开始输入后这里会实时显示渲染效果
            </p>
          )
        )}
      </div>
    </div>
  );
}
