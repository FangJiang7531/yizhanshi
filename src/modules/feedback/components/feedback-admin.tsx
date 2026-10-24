"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import { listFeedbackAction, markFeedbackStatusAction, type FeedbackItemDTO } from "@/modules/feedback/actions/feedback.actions";

/** 需求反馈管理页（仅 ADMIN）：查看全部意见征集，标记 纳入计划/已完成 */
export function FeedbackAdmin() {
  const toast = useToast();
  const [items, setItems] = useState<FeedbackItemDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listFeedbackAction();
    setLoading(false);
    if (res.success) setItems(res.data);
    else toast("error", res.error.message);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mark(id: string, status: "PLANNED" | "DONE") {
    const res = await markFeedbackStatusAction({ id, status });
    if (res.success) {
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
      toast("success", status === "PLANNED" ? "已标记为纳入计划" : "已标记为完成");
    } else {
      toast("error", res.error.message);
    }
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-primary)" }} aria-label="加载中" />
        </div>
      ) : items.length === 0 ? (
        <p className="card p-10 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
          暂无反馈。用户在未开放板块提交的意见会出现在这里，同时归档到 feedback/意见征集.md。
        </p>
      ) : (
        items.map((item) => (
          <article key={item.id} className="card p-4">
            <header className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{item.authorName}</span>
              <span className="chip" style={{ fontSize: 10, padding: "1px 8px" }}>
                {item.source}
              </span>
              <time className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                {new Date(item.createdAt).toLocaleString("zh-CN")}
              </time>
              <span className="ml-auto flex items-center gap-2">
                {item.status === "NEW" && (
                  <>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => void mark(item.id, "PLANNED")}>
                      <CircleDashed size={13} aria-hidden />
                      纳入计划
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => void mark(item.id, "DONE")}>
                      <CheckCircle2 size={13} aria-hidden />
                      完成
                    </button>
                  </>
                )}
                {item.status === "PLANNED" && (
                  <>
                    <span className="chip" style={{ fontSize: 10, color: "var(--color-info)" }}>已纳入计划</span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => void mark(item.id, "DONE")}>
                      <CheckCircle2 size={13} aria-hidden />
                      完成
                    </button>
                  </>
                )}
                {item.status === "DONE" && (
                  <span className="chip" style={{ fontSize: 10, color: "var(--color-success)" }}>已完成</span>
                )}
              </span>
            </header>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {item.content}
            </p>
          </article>
        ))
      )}
    </div>
  );
}
