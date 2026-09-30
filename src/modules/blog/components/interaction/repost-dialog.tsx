"use client";

import { useEffect, useState } from "react";
import { Loader2, Repeat2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { toggleRepostAction } from "../../actions/interaction.actions";
import { useToast } from "@/components/feedback/toast";

const MAX_COMMENT_LEN = 200;

/**
 * 转发对话框（PRD §5.5：可附转发语 ≤200 字；一人一帖一次，幂等 toggle）。
 * 已转发状态下打开 → 提供"取消转发"出口（toggle 语义的完整呈现）。
 */
export function RepostDialog({
  open,
  postId,
  reposted,
  onClose,
  onDone,
}: {
  open: boolean;
  postId: string;
  reposted: boolean;
  onClose: () => void;
  onDone: (result: { reposted: boolean; repostCount: number }) => void;
}) {
  const toast = useToast();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setComment("");
  }, [open]);

  async function submit(next: boolean) {
    if (busy) return;
    setBusy(true);
    // 取消转发时后端忽略 comment（toggle off）
    const res = await toggleRepostAction({ postId, comment: next ? comment.trim() || undefined : undefined });
    setBusy(false);
    if (!res.success) {
      toast.error(res.error.message || "转发失败，请重试");
      return;
    }
    onDone(res.data);
    toast.success(res.data.reposted ? "已转发到我的主页" : "已取消转发");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={reposted ? "转发管理" : "转发到我的主页"}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            关闭
          </button>
          {reposted ? (
            <button type="button" className="btn btn-danger" onClick={() => void submit(false)} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Repeat2 size={13} aria-hidden />}
              取消转发
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => void submit(true)} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Repeat2 size={13} aria-hidden />}
              确认转发
            </button>
          )}
        </>
      }
    >
      <div className="space-y-2">
        {reposted ? (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            你已转发过这篇文章。转发记录会出现在你的个人信息流，取消后计数同步回退。
          </p>
        ) : (
          <>
            <label htmlFor="repost-comment" className="text-sm font-medium">
              说点什么（可选）
            </label>
            <textarea
              id="repost-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT_LEN))}
              rows={3}
              maxLength={MAX_COMMENT_LEN}
              placeholder="附上你的观点（选填，200 字以内）…"
              className="input w-full resize-none"
            />
            <p className="text-right text-xs" style={{ color: "var(--color-text-muted)" }}>
              {comment.length} / {MAX_COMMENT_LEN}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
