"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  ExternalLink,
  File as FileIcon,
  Globe,
  Image as ImageIcon,
  Loader2,
  QrCode,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/feedback/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createFileLinkAction, createLinkAction, deleteLinkAction, listLinksAction, updateLinkAction } from "../actions/link-actions";
import type { ShortLinkDTO } from "../services/link.service";
import { QRCodeSVG } from "@/modules/blog/components/interaction/qrcode";

/**
 * 短链工作台：URL 短链 / 文件图片分享 双入口 + 我的短链列表（二维码/复制/启停/删除）。
 */
export function LinksBoard() {
  const toast = useToast();
  const [tab, setTab] = useState<"url" | "file">("url");
  const [items, setItems] = useState<ShortLinkDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [qrLink, setQrLink] = useState<ShortLinkDTO | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL 表单
  const [targetUrl, setTargetUrl] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [title, setTitle] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listLinksAction({});
    setLoading(false);
    if (res.success) setItems(res.data.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitUrl() {
    if (!targetUrl.trim() || submitting) return;
    setSubmitting(true);
    const res = await createLinkAction({
      kind: "url",
      targetUrl: targetUrl.trim(),
      customSlug: customSlug.trim() || undefined,
      title: title.trim() || undefined,
      expiresInDays,
    });
    setSubmitting(false);
    if (!res.success) {
      toast("error", res.error.message);
      return;
    }
    setItems((prev) => [res.data, ...prev]);
    setTargetUrl("");
    setCustomSlug("");
    setTitle("");
    setExpiresInDays(0);
    toast("success", "短链已创建");
  }

  async function submitFile(file: File) {
    setSubmitting(true);
    const res = await createFileLinkAction({
      file,
      customSlug: customSlug.trim() || undefined,
      title: title.trim() || undefined,
      expiresInDays,
    });
    setSubmitting(false);
    if (!res.success) {
      toast("error", res.error.message);
      return;
    }
    setItems((prev) => [res.data, ...prev]);
    setCustomSlug("");
    setTitle("");
    toast("success", "文件短链已生成");
  }

  async function toggleActive(item: ShortLinkDTO) {
    const res = await updateLinkAction({ id: item.id, isActive: !item.isActive });
    if (res.success) {
      setItems((prev) => prev.map((x) => (x.id === item.id ? res.data : x)));
    } else {
      toast("error", res.error.message);
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    const res = await deleteLinkAction({ id: confirmDelete });
    setConfirmDelete(null);
    if (res.success) {
      setItems((prev) => prev.filter((x) => x.id !== confirmDelete));
      toast("success", "已删除");
    } else {
      toast("error", res.error.message);
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(() => toast("success", "已复制"));
  }

  return (
    <div className="space-y-5">
      {/* 创建区 */}
      <section className="card p-4">
        <div className="mb-3 flex items-center gap-2" role="tablist" aria-label="短链类型">
          {(
            [
              { key: "url", label: "网址短链", icon: Globe },
              { key: "file", label: "文件 / 图片分享", icon: Upload },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors"
              style={{
                backgroundColor: tab === t.key ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "transparent",
                color: tab === t.key ? "var(--color-primary)" : "var(--color-text-secondary)",
                fontWeight: tab === t.key ? 600 : 400,
              }}
            >
              <t.icon size={14} aria-hidden />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "url" ? (
          <div className="space-y-3">
            <input
              className="input"
              placeholder="粘贴要缩短的链接（https://…）"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              aria-label="目标链接"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                className="input"
                placeholder="自定义别名（可选）"
                value={customSlug}
                onChange={(e) => setCustomSlug(e.target.value)}
                aria-label="自定义别名"
              />
              <input
                className="input"
                placeholder="标题备注（可选）"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-label="标题备注"
              />
              <select
                className="input"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                aria-label="有效期"
              >
                <option value={0}>永久有效</option>
                <option value={1}>1 天</option>
                <option value={7}>7 天</option>
                <option value={30}>30 天</option>
                <option value={365}>1 年</option>
              </select>
            </div>
            <div className="flex justify-end">
              <button type="button" className="btn btn-primary" disabled={!targetUrl.trim() || submitting} onClick={() => void submitUrl()}>
                {submitting ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
                生成短链
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void submitFile(f);
              }}
            />
            <button
              type="button"
              className="flex w-full flex-col items-center gap-2 rounded-[var(--radius)] border border-dashed py-8 transition-colors hover:bg-[var(--color-bg-elevated)]"
              style={{ borderColor: "var(--color-border)" }}
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 size={22} className="animate-spin" aria-hidden />
              ) : (
                <Upload size={22} style={{ color: "var(--color-primary)" }} aria-hidden />
              )}
              <span className="text-sm">点击选择文件或图片（≤20MB）</span>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                生成短链与二维码后，任何人点击即可下载
              </span>
            </button>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                className="input"
                placeholder="自定义别名（可选）"
                value={customSlug}
                onChange={(e) => setCustomSlug(e.target.value)}
                aria-label="自定义别名"
              />
              <input
                className="input"
                placeholder="标题备注（可选）"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-label="标题备注"
              />
            </div>
          </div>
        )}
      </section>

      {/* 列表 */}
      <section aria-label="我的短链">
        <h2 className="mb-3 text-sm font-semibold">我的短链</h2>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-16" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="card p-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
            还没有短链，从上方创建一个吧
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="card flex flex-wrap items-center gap-3 p-3.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)]"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--color-primary) 10%, transparent)",
                    color: "var(--color-primary)",
                  }}
                  aria-hidden
                >
                  {item.kind === "file" ? (
                    item.mimeType?.startsWith("image/") ? <ImageIcon size={16} /> : <FileIcon size={16} />
                  ) : (
                    <Globe size={16} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <a
                      href={`/s/${item.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-draw truncate text-sm font-medium"
                      style={{ color: "var(--color-primary)" }}
                    >
                      /s/{item.slug}
                    </a>
                    {!item.isActive && (
                      <span className="chip" style={{ fontSize: 10, padding: "1px 7px", color: "var(--color-danger)" }}>
                        已停用
                      </span>
                    )}
                    {item.expiresAt && new Date(item.expiresAt) < new Date() && (
                      <span className="chip" style={{ fontSize: 10, padding: "1px 7px", color: "var(--color-danger)" }}>
                        已过期
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {item.kind === "file"
                      ? `${item.fileName ?? "文件"} · ${((item.fileSize ?? 0) / 1024).toFixed(1)} KB`
                      : (item.targetUrl ?? "")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="mr-1 text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }} title="点击次数">
                    {item.clickCount} 次点击
                  </span>
                  <button type="button" className="icon-btn" title="复制短链" aria-label="复制短链" onClick={() => copy(item.shortUrl)}>
                    <Copy size={15} />
                  </button>
                  <button type="button" className="icon-btn" title="二维码" aria-label="查看二维码" onClick={() => setQrLink(item)}>
                    <QrCode size={15} />
                  </button>
                  {item.kind === "url" ? (
                    <a href={`/s/${item.slug}`} target="_blank" rel="noopener noreferrer" className="icon-btn" title="打开" aria-label="打开短链">
                      <ExternalLink size={15} />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="icon-btn"
                    title={item.isActive ? "停用" : "启用"}
                    aria-label={item.isActive ? "停用短链" : "启用短链"}
                    onClick={() => void toggleActive(item)}
                  >
                    {item.isActive ? <ToggleRight size={17} style={{ color: "var(--color-success)" }} /> : <ToggleLeft size={17} />}
                  </button>
                  <button type="button" className="icon-btn" title="删除" aria-label="删除短链" onClick={() => setConfirmDelete(item.id)}>
                    <Trash2 size={15} style={{ color: "var(--color-danger)" }} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="删除这条短链？"
        message="删除后短链立即失效，文件短链的存储文件也会一并删除。"
        confirmText="删除"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void remove()}
      />

      {/* 二维码弹层 */}
      {qrLink && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={() => setQrLink(null)}
          role="dialog"
          aria-label="短链二维码"
        >
          <div className="card pop-in p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-medium">{qrLink.title || `/s/${qrLink.slug}`}</p>
            <QRCodeSVG value={qrLink.shortUrl} size={180} />
            <p className="mt-3 break-all text-xs" style={{ color: "var(--color-text-muted)" }}>
              {qrLink.shortUrl}
            </p>
            <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => copy(qrLink.shortUrl)}>
              <Copy size={13} aria-hidden />
              复制链接
            </button>
          </div>
        </div>
      )}

      <p className="text-center text-xs" style={{ color: "var(--color-text-muted)" }}>
        访客无法使用短链。
        <Link href="/login?mode=register" className="underline underline-offset-2" style={{ color: "var(--color-primary)" }}>
          注册账号
        </Link>
        解锁
      </p>
    </div>
  );
}
