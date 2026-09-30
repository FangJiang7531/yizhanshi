"use client";

import { useRef, useState } from "react";
import { ChevronDown, Database, Eye, EyeOff, ImagePlus, Link2, Loader2, Lock, X } from "lucide-react";
import type { PostVisibility } from "@prisma/client";

/**
 * 编辑器左侧信息栏（PRD §5.2.1）：标题 / Slug / 摘要 / 封面 / 标签 /
 * 可见性 / 评论开关 / 转发开关 / SEO（折叠）/ 插入数据卡片。
 *
 * 所有变更经 onChange(patch) 冒泡给 shell —— shell 统一 touch() 自动保存，
 * 本组件不直接调用任何 Action（slug 修改除外，它是独立操作，见 updateSlugAction）。
 */

export type EditorFormValues = {
  title: string;
  excerpt: string;
  coverImage: string | null;
  tagNames: string[];
  visibility: PostVisibility;
  allowComment: boolean;
  allowRepost: boolean;
  seoTitle: string;
  seoDesc: string;
  ogImage: string | null;
};

const VISIBILITY_OPTIONS: { value: PostVisibility; label: string; desc: string; icon: typeof Eye }[] = [
  { value: "PUBLIC", label: "公开", desc: "出现在列表、搜索与 RSS 中", icon: Eye },
  { value: "UNLISTED", label: "不列出", desc: "有链接即可访问，不进列表", icon: EyeOff },
  { value: "PRIVATE", label: "私密", desc: "仅自己可见", icon: Lock },
];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
          {label}
        </label>
        {hint}
      </div>
      {children}
    </div>
  );
}

export function EditorInfoPanel({
  value,
  onChange,
  slug,
  onSlugChange,
  onCoverFile,
  coverUploading,
  onOpenDataCard,
}: {
  value: EditorFormValues;
  onChange: (patch: Partial<EditorFormValues>) => void;
  slug: string;
  /** 确认修改链接标识（shell 调 updateSlugAction，失败会提示且不落地） */
  onSlugChange: (next: string) => Promise<boolean>;
  onCoverFile: (file: File) => void;
  coverUploading: boolean;
  onOpenDataCard: () => void;
}) {
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [tagInput, setTagInput] = useState("");
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState(slug);
  const [slugBusy, setSlugBusy] = useState(false);

  function addTag() {
    const name = tagInput.trim();
    if (!name) return;
    if (value.tagNames.includes(name)) {
      setTagInput("");
      return;
    }
    if (value.tagNames.length >= 8) return;
    onChange({ tagNames: [...value.tagNames, name] });
    setTagInput("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-4 py-4 text-sm">
      <Field label="标题">
        <input
          className="input"
          value={value.title}
          maxLength={120}
          placeholder="输入文章标题"
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </Field>

      <Field
        label="链接标识（Slug）"
        hint={
          <button
            type="button"
            className="text-xs underline underline-offset-2"
            style={{ color: "var(--color-primary)" }}
            onClick={() => {
              setSlugDraft(slug);
              setEditingSlug((v) => !v);
            }}
          >
            {editingSlug ? "取消" : "修改"}
          </button>
        }
      >
        {editingSlug ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
              <Link2 size={12} />
            </span>
            <input
              className="input flex-1"
              value={slugDraft}
              spellCheck={false}
              onChange={(e) => setSlugDraft(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary px-2.5 py-1 text-xs"
              disabled={slugBusy || !/^[a-z0-9-]{3,80}$/.test(slugDraft)}
              onClick={async () => {
                setSlugBusy(true);
                const okFlag = await onSlugChange(slugDraft.trim());
                setSlugBusy(false);
                if (okFlag) setEditingSlug(false);
              }}
            >
              {slugBusy ? <Loader2 size={12} className="animate-spin" /> : "保存"}
            </button>
          </div>
        ) : (
          <p className="truncate font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
            /blog/p/{slug}
          </p>
        )}
      </Field>

      <Field
        label="摘要"
        hint={
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            {value.excerpt.length}/300
          </span>
        }
      >
        <textarea
          className="input min-h-[72px] resize-y"
          value={value.excerpt}
          maxLength={300}
          placeholder="留空时自动截取正文开头"
          onChange={(e) => onChange({ excerpt: e.target.value })}
        />
      </Field>

      <Field label="封面图">
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onCoverFile(file);
          }}
        />
        {value.coverImage ? (
          <div className="group relative overflow-hidden rounded-[var(--radius-sm,6px)] border" style={{ borderColor: "var(--color-border)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.coverImage} alt="封面预览" className="aspect-video w-full object-cover" />
            <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                className="rounded bg-black/60 p-1 text-white"
                title="更换封面"
                onClick={() => coverInputRef.current?.click()}
              >
                <ImagePlus size={13} />
              </button>
              <button
                type="button"
                className="rounded bg-black/60 p-1 text-white"
                title="移除封面"
                onClick={() => onChange({ coverImage: null })}
              >
                <X size={13} />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="flex aspect-video w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm,6px)] border border-dashed text-xs transition-colors hover:border-[var(--color-primary)]"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
            onClick={() => coverInputRef.current?.click()}
            disabled={coverUploading}
          >
            {coverUploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            {coverUploading ? "上传中…" : "上传封面（16:9 效果最佳）"}
          </button>
        )}
      </Field>

      <Field
        label="标签"
        hint={
          <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            {value.tagNames.length}/8
          </span>
        }
      >
        {value.tagNames.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {value.tagNames.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                {name}
                <button
                  type="button"
                  aria-label={`移除标签 ${name}`}
                  onClick={() => onChange({ tagNames: value.tagNames.filter((t) => t !== name) })}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          className="input"
          value={tagInput}
          maxLength={20}
          placeholder={value.tagNames.length >= 8 ? "最多 8 个标签" : "输入后回车添加"}
          disabled={value.tagNames.length >= 8}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
        />
      </Field>

      <Field label="可见性">
        <div className="space-y-1">
          {VISIBILITY_OPTIONS.map((opt) => {
            const active = value.visibility === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                className="flex w-full items-start gap-2 rounded-[var(--radius-sm,6px)] border px-2.5 py-1.5 text-left transition-colors"
                style={{
                  borderColor: active ? "var(--color-primary)" : "var(--color-border)",
                  backgroundColor: active
                    ? "color-mix(in srgb, var(--color-primary) 7%, transparent)"
                    : "transparent",
                }}
                onClick={() => onChange({ visibility: opt.value })}
              >
                <Icon size={14} className="mt-0.5 shrink-0" style={{ color: active ? "var(--color-primary)" : "var(--color-text-muted)" }} />
                <span className="min-w-0">
                  <span className="block text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {opt.label}
                  </span>
                  <span className="block text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    {opt.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Field>

      <div className="space-y-2">
        <SwitchRow
          label="允许评论"
          checked={value.allowComment}
          onToggle={() => onChange({ allowComment: !value.allowComment })}
        />
        <SwitchRow
          label="允许转发"
          checked={value.allowRepost}
          onToggle={() => onChange({ allowRepost: !value.allowRepost })}
        />
      </div>

      <details className="rounded-[var(--radius-sm,6px)] border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
        <summary className="flex cursor-pointer items-center gap-1 text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
          <ChevronDown size={13} />
          SEO 设置（选填）
        </summary>
        <div className="mt-3 space-y-3">
          <Field
            label="SEO 标题"
            hint={
              <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                {value.seoTitle.length}/60
              </span>
            }
          >
            <input
              className="input"
              value={value.seoTitle}
              maxLength={60}
              placeholder="默认使用文章标题"
              onChange={(e) => onChange({ seoTitle: e.target.value })}
            />
          </Field>
          <Field
            label="SEO 描述"
            hint={
              <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                {value.seoDesc.length}/160
              </span>
            }
          >
            <textarea
              className="input min-h-[56px] resize-y"
              value={value.seoDesc}
              maxLength={160}
              placeholder="默认使用摘要"
              onChange={(e) => onChange({ seoDesc: e.target.value })}
            />
          </Field>
          <Field label="OG 图">
            <input
              className="input font-mono text-xs"
              value={value.ogImage ?? ""}
              placeholder="https:// 或 /api/files/…"
              onChange={(e) => onChange({ ogImage: e.target.value.trim() || null })}
            />
          </Field>
        </div>
      </details>

      <button
        type="button"
        className="btn btn-ghost justify-start gap-2 text-xs"
        onClick={onOpenDataCard}
      >
        <Database size={14} />
        插入数据卡片（习惯 / 任务）
      </button>
    </div>
  );
}

function SwitchRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
        style={{ backgroundColor: checked ? "var(--color-primary)" : "var(--color-border)" }}
        onClick={onToggle}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-150"
          style={{ left: checked ? "18px" : "2px" }}
        />
      </button>
    </div>
  );
}
