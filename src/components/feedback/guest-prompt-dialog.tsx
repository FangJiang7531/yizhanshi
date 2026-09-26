"use client";

import { LockKeyhole, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/modal";

/**
 * 访客写操作被拒时的说明对话框（PRD §6.3 硬性要求）。
 *
 * 关键产品决策：不允许“点了没反应”。按钮保持可点击，点击后弹出本对话框，
 * 既说明限制，又是一次自然的注册转化引导。
 */
export function GuestPromptDialog({
  open,
  onClose,
  onConfirm,
  actionLabel = "该功能",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  actionLabel?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="访客模式无法保存数据"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            继续浏览
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            <UserPlus size={15} />
            立即注册
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)]"
          style={{ backgroundColor: "var(--color-bg-elevated)", color: "var(--color-warning)" }}
          aria-hidden
        >
          <LockKeyhole size={20} />
        </div>
        <div className="space-y-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          <p>
            访客模式可以浏览全部界面、切换板块与主题，但
            <strong style={{ color: "var(--color-text-primary)" }}>{actionLabel}会写入数据</strong>
            ，因此被限制。
          </p>
          <p>注册账号即可解锁任务管理、习惯打卡等全部功能。</p>
        </div>
      </div>
    </Modal>
  );
}
