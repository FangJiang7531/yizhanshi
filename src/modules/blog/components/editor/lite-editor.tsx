"use client";

import { useRef, useState } from "react";
import { Eye, Image as ImageIcon, Loader2 } from "lucide-react";
import { EditorTypographyBar } from "./editor-typography";
import { PreviewPane } from "./preview-pane";

/**
 * 轻量版编辑器（社交媒体发帖式）：
 * 一个大输入框 + 插图方块按钮 + 字体选择，去掉加粗/标题等 Office 工具，
 * 保留最基本的图文编辑能力，降低发布门槛。支持「编辑/预览」切换。
 */
export function LiteEditor({
  value,
  onChange,
  onPasteFile,
  previewRef,
}: {
  value: string;
  onChange: (v: string) => void;
  /** 图片文件交给外壳上传管线（与专业版同一套上传/落库） */
  onPasteFile?: (file: File) => void;
  previewRef: React.RefObject<HTMLDivElement | null>;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState(false);

  function insertAtCursor(text: string) {
    const el = taRef.current;
    if (!el) {
      onChange(value + text);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function pickImage(file: File) {
    if (!onPasteFile) return;
    setUploading(true);
    // onPasteFile 由外壳实现：上传完成后在文末插入 Markdown（轻量版不做光标级插入）
    onPasteFile(file);
    // 上传是异步的；外壳会 toast 提示结果
    setTimeout(() => setUploading(false), 1200);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 顶部条：插图 + 字体 + 预览切换 */}
      <div
        className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5"
        style={{ borderColor: "var(--color-border)" }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void pickImage(f);
          }}
        />
        <button
          type="button"
          className="editor-tool-btn editor-tool-btn-wide"
          aria-label="插入图片"
          data-tip="插入图片（支持 GIF，≤5MB）"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ImageIcon size={15} />}
          <span className="text-xs">插入图片</span>
        </button>
        <span
          className="editor-tool-btn cursor-pointer editor-tool-btn-wide"
          aria-label="插入链接"
          data-tip="插入链接"
          role="button"
          tabIndex={0}
          onClick={() => insertAtCursor("[链接文字](url)")}
          onKeyDown={(e) => {
            if (e.key === "Enter") insertAtCursor("[链接文字](url)");
          }}
        >
          🔗<span className="text-xs">链接</span>
        </span>
        <EditorTypographyBar targetSelector=".lite-editor-textarea, .blog-prose" />
        <button
          type="button"
          className="editor-tool-btn editor-tool-btn-wide ml-auto"
          aria-label={showPreview ? "返回编辑" : "预览"}
          data-tip={showPreview ? "返回编辑" : "预览效果"}
          onClick={() => setShowPreview((v) => !v)}
        >
          <Eye size={15} />
          <span className="text-xs">{showPreview ? "继续编辑" : "预览"}</span>
        </button>
      </div>

      {showPreview ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <PreviewPane contentMd={value} containerRef={previewRef} className="h-auto" />
        </div>
      ) : (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const file = Array.from(e.clipboardData.files)[0];
            if (file && file.type.startsWith("image/") && onPasteFile) {
              e.preventDefault();
              void pickImage(file);
            }
          }}
          rows={12}
          placeholder="输入正文… 支持基础 Markdown，也可以只当普通文本框用。图片用上方按钮或直接粘贴。"
          className="lite-editor-textarea min-h-0 flex-1 resize-none border-0 bg-transparent px-4 py-4 text-[15px] leading-relaxed focus:outline-none sm:px-6"
          style={{ color: "var(--color-text-primary)" }}
          aria-label="正文"
        />
      )}
      <div
        className="flex h-7 shrink-0 items-center px-3 text-[11px]"
        style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
      >
        {value.length.toLocaleString("zh-CN")} 字符 · {value.length} 字
      </div>
    </div>
  );
}
