"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import { QRCodeSVG } from "./qrcode";

/**
 * 站外分享菜单：复制链接 / 二维码 / QQ 空间 / 微博。
 * 微信无网页端直投 API，走「复制链接 + 提示到微信粘贴」路径。
 */
export function ShareMenu({
  slug,
  title,
  onShared,
}: {
  slug: string;
  title: string;
  /** 分享动作完成后回调（计数） */
  onShared?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const url = typeof window !== "undefined" ? `${window.location.origin}/blog/p/${slug}` : "";

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    onShared?.();
  }

  function openShare(target: "qq" | "weibo") {
    const encoded = encodeURIComponent(url);
    const text = encodeURIComponent(title);
    const shareUrl =
      target === "qq"
        ? `https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=${encoded}&title=${text}&summary=`
        : `https://service.weibo.com/share/share.php?url=${encoded}&title=${text}`;
    window.open(shareUrl, "_blank", "noopener,width=680,height=540");
    onShared?.();
    setOpen(false);
  }

  async function wechat() {
    await copyLink();
    setOpen(false);
  }

  return (
    <span className="relative inline-flex" ref={rootRef}>
      <button type="button" className="interaction-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="分享到站外">
        <Share2 size={15} aria-hidden />
        {typeof onShared === "function" ? null : null}
      </button>

      {open && (
        <span
          className="card pop-in absolute bottom-[calc(100%+8px)] left-0 z-40 block w-60 overflow-hidden p-1.5"
          style={{ boxShadow: "var(--shadow-lg)" }}
          role="menu"
        >
          <MenuRow icon={copied ? Check : Copy} label={copied ? "已复制" : "复制链接"} onClick={() => void copyLink()} />
          <MenuRow icon={Link2} label="QQ 空间" onClick={() => openShare("qq")} />
          <MenuRow icon={Link2} label="微博" onClick={() => openShare("weibo")} />
          <MenuRow icon={Share2} label="微信（复制链接后打开微信粘贴）" onClick={() => void wechat()} />

          {/* 二维码预览：扫码直达文章 */}
          <span className="mt-1.5 flex flex-col items-center gap-1 border-t pt-2" style={{ borderColor: "color-mix(in srgb, var(--color-border) 50%, transparent)" }}>
            <QRCodeSVG value={url} size={120} />
            <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              扫码在手机上阅读
            </span>
          </span>
        </span>
      )}
    </span>
  );
}

function MenuRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-[var(--color-bg-elevated)]"
    >
      <Icon size={14} aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}
