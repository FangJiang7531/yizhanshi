"use client";

import { useState } from "react";
import { Loader2, SendHorizontal, X } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import { submitFeedbackAction } from "../actions/feedback.actions";

/**
 * 需求反馈表单弹窗：来源板块固定为触发按钮所在的板块名。
 * 提交成功后写库 + 归档到 feedback/意见征集.md，管理端 /feedback 可查。
 */
export function FeedbackDialog({
  source,
  open,
  onClose,
}: {
  source: string;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    const res = await submitFeedbackAction({ source, content: content.trim() });
    setSubmitting(false);
    if (res.success) {
      toast("success", "感谢反馈！我们已收到你的建议");
      setContent("");
      onClose();
    } else {
      toast("error", res.error.message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
      role="dialog"
      aria-label="功能反馈"
    >
      <div className="card pop-in w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <header className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">想要什么功能，告诉我们</h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
              来自「{source}」板块 · 提交后我们会认真评估
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </header>
        <textarea
          className="input min-h-28 w-full resize-y text-sm"
          placeholder="描述你期望的功能或改进建议（5–2000 字）…"
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, 2000))}
          maxLength={2000}
          aria-label="反馈内容"
        />
        <p className="mt-1 text-right text-[11px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          {content.length} / 2000
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={content.trim().length < 5 || submitting}
            onClick={() => void submit()}
          >
            {submitting ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <SendHorizontal size={13} aria-hidden />}
            提交反馈
          </button>
        </div>
      </div>
    </div>
  );
}
