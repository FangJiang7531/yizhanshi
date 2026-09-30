"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Columns2,
  Eye,
  Loader2,
  PanelLeft,
  PenLine,
  Rocket,
  Save,
} from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import { Modal } from "@/components/ui/modal";
import { MarkdownEditor, type MarkdownEditorHandle } from "./markdown-editor";
import { EditorToolbar } from "./editor-toolbar";
import { EditorInfoPanel, type EditorFormValues } from "./editor-info-panel";
import { PreviewPane } from "./preview-pane";
import { DataCardDialog } from "./data-card-dialog";
import { clearLocalDraft, readLocalDraft, useAutosave, type LocalDraftBackup } from "../../hooks/use-autosave";
import { calcStats } from "../../lib/stats";
import {
  getPostForEditAction,
  publishPostAction,
  saveDraftAction,
  updateSlugAction,
} from "../../actions/post.actions";
import { uploadBlogImageAction } from "../../actions/upload.actions";
import type { PostEditDTO } from "../../types";

/**
 * 编辑器外壳（PRD §5.2 全集）：
 * 顶栏（状态/预览/设置/保存/发布）+ 三区（信息栏 / CodeMirror / 实时预览）
 * + 状态栏（字数、阅读时长、光标、保存时间）。
 *
 * 数据流：所有字段变更 → updateForm/updateContent → 状态更新 + autosave.touch()。
 * 三层自动保存、冲突冻结、本地恢复、图片粘贴上传、数据卡片插入均在此编排。
 */

type ViewMode = "split" | "edit" | "preview";
type EditorPayload = EditorFormValues & { contentMd: string };

const VIEW_MODE_KEY = "pwb:blog:view-mode";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

function timeHms(d: Date): string {
  return d.toLocaleTimeString("zh-CN", { hour12: false });
}

export function EditorShell({ post, initialPreview = false }: { post: PostEditDTO; initialPreview?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);

  // ───────── 表单状态（唯一数据源；CM 内部文档经 onChange 同步进来）─────────
  const [form, setForm] = useState<EditorFormValues>({
    title: post.title,
    excerpt: post.excerpt ?? "",
    coverImage: post.coverImage,
    tagNames: post.tags.map((t) => t.name),
    visibility: post.visibility,
    allowComment: post.allowComment,
    allowRepost: post.allowRepost,
    seoTitle: post.seoTitle ?? "",
    seoDesc: post.seoDesc ?? "",
    ogImage: post.ogImage,
  });
  const [contentMd, setContentMd] = useState(post.contentMd);
  const [slug, setSlug] = useState(post.slug);
  const [coverUploading, setCoverUploading] = useState(false);

  const payloadRef = useRef<EditorPayload>({ ...form, contentMd });
  payloadRef.current = { ...form, contentMd };

  // ───────── 视图模式（持久化）与移动端降级 ─────────
  const [mode, setMode] = useState<ViewMode>(initialPreview ? "preview" : "split");
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">(initialPreview ? "preview" : "edit");
  const [infoOpen, setInfoOpen] = useState(true);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  /** 信息栏以常驻列呈现的下限宽度（低于此宽度改用 Modal，避免编辑区被挤成条） */
  const isWide = useMediaQuery("(min-width: 1280px)");

  useEffect(() => {
    // URL 显式指定预览（列表"预览"操作）时不被本地偏好覆盖
    if (initialPreview) return;
    const saved = window.localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "split" || saved === "edit" || saved === "preview") setMode(saved);
  }, [initialPreview]);

  const changeMode = useCallback((next: ViewMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {
      /* 隐私模式下持久化失败不影响使用 */
    }
  }, []);

  const showEdit = mode === "edit" || (mode === "split" && (isDesktop || mobileTab === "edit"));
  const showPreview = mode === "preview" || (mode === "split" && (isDesktop || mobileTab === "preview"));
  const showSplitDesktop = mode === "split" && isDesktop;

  // ───────── 自动保存（三层保险 + 冲突检测）─────────
  const autosave = useAutosave<EditorPayload>({
    postId: post.id,
    getPayload: () => payloadRef.current,
    save: async (payload, baseUpdatedAt) =>
      saveDraftAction({
        id: post.id,
        title: payload.title,
        excerpt: payload.excerpt,
        contentMd: payload.contentMd,
        coverImage: payload.coverImage,
        tagNames: payload.tagNames,
        visibility: payload.visibility,
        allowComment: payload.allowComment,
        allowRepost: payload.allowRepost,
        seoTitle: payload.seoTitle,
        seoDesc: payload.seoDesc,
        ogImage: payload.ogImage,
        baseUpdatedAt,
      }),
    initialUpdatedAt: post.updatedAt,
    onError: (message) => toast("error", `自动保存失败：${message}`),
  });

  const { touch } = autosave;

  const updateForm = useCallback(
    (patch: Partial<EditorFormValues>) => {
      setForm((prev) => ({ ...prev, ...patch }));
      touch();
    },
    [touch],
  );

  const updateContent = useCallback(
    (next: string) => {
      setContentMd(next);
      touch();
    },
    [touch],
  );

  // ───────── 本地备份恢复（Gate 5.3-2）─────────
  const [localBackup, setLocalBackup] = useState<LocalDraftBackup<EditorPayload> | null>(null);
  const initialUpdatedAtRef = useRef(post.updatedAt);

  useEffect(() => {
    const backup = readLocalDraft<EditorPayload>(post.id);
    if (!backup) return;
    if (backup.savedAt > new Date(initialUpdatedAtRef.current).getTime()) {
      setLocalBackup(backup);
    } else {
      clearLocalDraft(post.id);
    }
  }, [post.id]);

  // ───────── 图片上传（粘贴 / 拖拽 / 封面）─────────
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const uploadImage = useCallback(
    async (file: File): Promise<string | null> => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadBlogImageAction(fd);
      if (res.success) return res.data.url;
      toast("error", res.error.message);
      return null;
    },
    [toast],
  );

  const handlePasteFile = useCallback(
    async (file: File) => {
      setImageUploading(true);
      const url = await uploadImage(file);
      setImageUploading(false);
      if (!url) return;
      const alt = file.name.replace(/\.[^.]+$/, "") || "图片";
      editorRef.current?.insertText(`![${alt}](${url})`);
      toast("success", "图片已上传并插入");
    },
    [uploadImage, toast],
  );

  const handleCoverFile = useCallback(
    async (file: File) => {
      setCoverUploading(true);
      const url = await uploadImage(file);
      setCoverUploading(false);
      if (url) updateForm({ coverImage: url });
    },
    [uploadImage, updateForm],
  );

  // ───────── 数据卡片 ─────────
  const [dataCardOpen, setDataCardOpen] = useState(false);
  const handleInsertCard = useCallback((marker: string) => {
    editorRef.current?.insertText(`\n\n${marker}\n\n`);
    toast("success", "数据卡片已插入");
  }, [toast]);

  // ───────── slug 修改（独立操作、显式确认）─────────
  const handleSlugChange = useCallback(
    async (next: string): Promise<boolean> => {
      const res = await updateSlugAction({ id: post.id, slug: next });
      if (res.success) {
        setSlug(res.data.newSlug);
        toast("success", `链接标识已更新为 ${res.data.newSlug}`);
        return true;
      }
      toast("error", res.error.message);
      return false;
    },
    [post.id, toast],
  );

  // ───────── 发布（PRD §5.3）─────────
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const handlePublish = useCallback(async () => {
    if (publishing) return;
    if (!form.title.trim()) {
      toast("error", "请先填写标题再发布");
      return;
    }
    if (!contentMd.trim()) {
      toast("error", "正文不能为空");
      return;
    }
    setPublishing(true);
    try {
      // 先落盘最新数据（若冲突/失败由 autosave 的提示接管，发布中止）
      const synced = await autosave.flush();
      if (!synced) {
        toast("error", "还有未同步的修改，请处理后再发布");
        return;
      }
      const res = await publishPostAction({
        id: post.id,
        title: form.title,
        excerpt: form.excerpt,
        contentMd,
        coverImage: form.coverImage,
        tagNames: form.tagNames,
        visibility: form.visibility,
        allowComment: form.allowComment,
        allowRepost: form.allowRepost,
        seoTitle: form.seoTitle,
        seoDesc: form.seoDesc,
        ogImage: form.ogImage,
      });
      if (res.success) {
        setPublished(true);
        if (res.data.status === "REVIEW") {
          toast("success", "内容已提交审核，通过后自动发布");
          router.push("/blog/me");
        } else {
          toast("success", "发布成功");
          router.push(`/blog/p/${res.data.slug}`);
        }
      } else if (res.error.code === "CONTENT_REJECTED") {
        toast("error", res.error.message);
      } else if (res.error.code === "VALIDATION_ERROR") {
        const first = res.error.fields ? Object.values(res.error.fields)[0]?.[0] : undefined;
        toast("error", first ?? res.error.message);
      } else {
        toast("error", res.error.message);
      }
    } finally {
      setPublishing(false);
    }
  }, [publishing, form, contentMd, autosave, post.id, toast, router]);

  // ───────── 冲突处理 ─────────
  const [conflictOpen, setConflictOpen] = useState(false);
  const [serverSnapshot, setServerSnapshot] = useState<PostEditDTO | null>(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);

  useEffect(() => {
    if (autosave.conflict) {
      setConflictOpen(true);
      setServerSnapshot(null);
      setComparisonOpen(false);
      // 预取服务端版本（供"对比查看"）
      void getPostForEditAction({ id: post.id }).then((res) => {
        if (res.success) setServerSnapshot(res.data);
      });
    }
  }, [autosave.conflict, post.id]);

  const resolveKeepServer = useCallback(async () => {
    const res = await getPostForEditAction({ id: post.id });
    if (!res.success) {
      toast("error", res.error.message);
      return;
    }
    const p = res.data;
    setForm({
      title: p.title,
      excerpt: p.excerpt ?? "",
      coverImage: p.coverImage,
      tagNames: p.tags.map((t) => t.name),
      visibility: p.visibility,
      allowComment: p.allowComment,
      allowRepost: p.allowRepost,
      seoTitle: p.seoTitle ?? "",
      seoDesc: p.seoDesc ?? "",
      ogImage: p.ogImage,
    });
    setContentMd(p.contentMd);
    setSlug(p.slug);
    autosave.keepServer();
    setConflictOpen(false);
    toast("info", "已切换为服务端版本");
  }, [post.id, autosave, toast]);

  const resolveKeepLocal = useCallback(async () => {
    const okFlag = await autosave.keepLocal();
    setConflictOpen(false);
    if (okFlag) toast("success", "已用本地版本覆盖服务端");
    else toast("error", "覆盖失败，请重试");
  }, [autosave, toast]);

  // ───────── 状态栏数据 ─────────
  const stats = useMemo(() => calcStats(contentMd), [contentMd]);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  const saveStatus = useMemo((): { dot: string; text: string } => {
    switch (autosave.status) {
      case "saving":
        return { dot: "var(--color-info)", text: "保存中…" };
      case "saved":
        return { dot: "var(--color-success)", text: autosave.lastSavedAt ? `已保存 ${timeHms(autosave.lastSavedAt)}` : "已保存" };
      case "dirty":
        return { dot: "var(--color-warning)", text: "未保存" };
      case "offline":
        return { dot: "var(--color-warning)", text: "离线，等待网络…" };
      case "conflict":
        return { dot: "var(--color-danger)", text: "存在冲突" };
      case "error":
        return { dot: "var(--color-danger)", text: "保存失败，点击重试" };
      default:
        return { dot: "var(--color-success)", text: "已保存" };
    }
  }, [autosave.status, autosave.lastSavedAt]);

  return (
    <div className="flex h-[calc(100dvh-104px)] min-h-[480px] flex-col overflow-hidden rounded-[var(--radius)] border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-surface)" }}>
      {/* 本地恢复横幅 */}
      {localBackup && (
        <div
          className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs"
          style={{ borderColor: "var(--color-border)", backgroundColor: "color-mix(in srgb, var(--color-warning) 10%, transparent)" }}
        >
          <AlertTriangle size={13} style={{ color: "var(--color-warning)" }} />
          <span style={{ color: "var(--color-text-secondary)" }}>
            发现未同步的本地内容（保存于 {timeHms(new Date(localBackup.savedAt))}），可能因浏览器关闭前未完成同步。
          </span>
          <button
            type="button"
            className="btn btn-primary px-2.5 py-0.5 text-xs"
            onClick={() => {
              const p = localBackup.payload;
              setForm((prev) => ({ ...prev, ...p }));
              setContentMd(p.contentMd);
              touch();
              setLocalBackup(null);
              toast("info", "已恢复本地内容，正在同步到服务端");
            }}
          >
            恢复
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2.5 py-0.5 text-xs"
            onClick={() => {
              clearLocalDraft(post.id);
              setLocalBackup(null);
            }}
          >
            丢弃
          </button>
        </div>
      )}

      {/* 顶栏 */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: "var(--color-border)" }}>
        <Link
          href="/blog/me"
          className="icon-btn"
          title="返回我的文章"
          onClick={() => {
            if (autosave.isDirty) void autosave.flush();
          }}
        >
          <ArrowLeft size={16} />
        </Link>

        <button
          type="button"
          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors hover:bg-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)]"
          title={autosave.status === "error" ? "点击重试保存" : undefined}
          onClick={() => {
            if (autosave.status === "error" || autosave.status === "dirty") void autosave.flush();
          }}
        >
          <span
            className={`h-2 w-2 rounded-full ${autosave.status === "saving" ? "animate-pulse" : ""}`}
            style={{ backgroundColor: saveStatus.dot }}
            aria-hidden
          />
          <span style={{ color: "var(--color-text-secondary)" }}>{saveStatus.text}</span>
        </button>

        <span className="mx-1 hidden h-4 w-px sm:block" style={{ backgroundColor: "var(--color-border)" }} aria-hidden />

        {/* 桌面视图模式切换 */}
        <div className="hidden items-center gap-0.5 md:flex">
          <ViewModeButton active={mode === "split"} title="分栏视图" onClick={() => changeMode("split")} icon={Columns2} />
          <ViewModeButton active={mode === "edit"} title="纯编辑" onClick={() => changeMode("edit")} icon={PenLine} />
          <ViewModeButton active={mode === "preview"} title="纯预览" onClick={() => changeMode("preview")} icon={Eye} />
        </div>

        {/* 移动端 tab */}
        <div className="flex items-center gap-0.5 md:hidden">
          <button
            type="button"
            className={`rounded px-2 py-1 text-xs ${mobileTab === "edit" && mode === "split" ? "font-medium" : ""}`}
            style={{ color: mobileTab === "edit" && mode === "split" ? "var(--color-primary)" : "var(--color-text-muted)" }}
            onClick={() => {
              setMobileTab("edit");
              if (mode === "preview") changeMode("split");
            }}
          >
            编辑
          </button>
          <button
            type="button"
            className={`rounded px-2 py-1 text-xs ${mobileTab === "preview" || mode === "preview" ? "font-medium" : ""}`}
            style={{ color: mobileTab === "preview" || mode === "preview" ? "var(--color-primary)" : "var(--color-text-muted)" }}
            onClick={() => {
              setMobileTab("preview");
              if (mode === "edit") changeMode("split");
            }}
          >
            预览
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {imageUploading && (
            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
              <Loader2 size={12} className="animate-spin" />
              图片上传中
            </span>
          )}
          <button
            type="button"
            className="icon-btn"
            title="文章设置（标题 / 封面 / 标签 / 可见性）"
            onClick={() => {
              if (isWide) setInfoOpen((v) => !v);
              else setInfoModalOpen(true);
            }}
          >
            <PanelLeft size={16} />
          </button>
          <button
            type="button"
            className="btn btn-ghost gap-1 px-2.5 py-1.5 text-xs"
            disabled={autosave.status === "saving"}
            onClick={() => void autosave.flush()}
            title="保存草稿 (Ctrl+S)"
          >
            {autosave.status === "saving" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            保存草稿
          </button>
          <button
            type="button"
            className={`btn btn-primary gap-1 px-3 py-1.5 text-xs ${published ? "publish-ripple" : ""}`}
            disabled={publishing}
            onClick={() => void handlePublish()}
            title="发布 (Ctrl+Enter)"
          >
            {publishing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : published ? (
              <Check size={13} />
            ) : (
              <Rocket size={13} />
            )}
            {publishing ? "发布中…" : published ? "已发布" : "发布"}
          </button>
        </div>
      </div>

      {/* 三区主体 */}
      <div className="flex min-h-0 flex-1">
        {/* 信息栏（宽屏常驻列；窄屏走顶栏"设置"按钮的 Modal） */}
        {isWide && infoOpen && (
          <aside
            className="w-[280px] shrink-0 border-r"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-elevated)" }}
          >
            <EditorInfoPanel
              value={form}
              onChange={updateForm}
              slug={slug}
              onSlugChange={handleSlugChange}
              onCoverFile={(f) => void handleCoverFile(f)}
              coverUploading={coverUploading}
              onOpenDataCard={() => setDataCardOpen(true)}
            />
          </aside>
        )}

        {/* 编辑 + 预览 */}
        <div className={`flex min-h-0 min-w-0 flex-1 ${showSplitDesktop ? "grid grid-cols-2" : ""}`}>
          {/* 编辑区 */}
          <div className={`flex min-h-0 min-w-0 flex-col ${showEdit ? "flex" : "hidden"}`}>
          <EditorToolbar
            editorRef={editorRef}
            onPickImage={() => imageInputRef.current?.click()}
            onOpenDataCard={() => setDataCardOpen(true)}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            <MarkdownEditor
              ref={editorRef}
              value={contentMd}
              onChange={updateContent}
              onCursorChange={setCursor}
              onSave={() => void autosave.flush()}
              onPublish={() => void handlePublish()}
              onPasteFile={(f) => void handlePasteFile(f)}
              onScrollRatio={(ratio) => {
                const el = previewScrollRef.current;
                if (!el) return;
                const max = el.scrollHeight - el.clientHeight;
                if (max > 0) el.scrollTop = ratio * max;
              }}
            />
          </div>
        </div>

        {/* 预览区 */}
        <div
          className={`min-h-0 min-w-0 flex-col border-l ${showPreview ? "flex" : "hidden"} ${showSplitDesktop ? "" : "flex-1"}`}
          style={{ borderColor: "var(--color-border)" }}
        >
          <PreviewPane contentMd={contentMd} containerRef={previewScrollRef} className="h-full" />
        </div>
        </div>
      </div>

      {/* 状态栏 */}
      <div
        className="flex h-8 shrink-0 items-center gap-3 overflow-hidden border-t px-3 text-[11px]"
        style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
      >
        <span>{stats.wordCount.toLocaleString("zh-CN")} 字</span>
        <span>{contentMd.length.toLocaleString("zh-CN")} 字符</span>
        <span>约 {stats.readingMinutes} 分钟</span>
        <span className="ml-auto">
          行 {cursor.line}，列 {cursor.col}
        </span>
        <span>{autosave.lastSavedAt ? `保存于 ${timeHms(autosave.lastSavedAt)}` : ""}</span>
      </div>

      {/* 隐藏输入：工具栏图片按钮 */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handlePasteFile(file);
        }}
      />

      {/* 数据卡片对话框 */}
      <DataCardDialog open={dataCardOpen} onClose={() => setDataCardOpen(false)} onInsert={handleInsertCard} />

      {/* 窄屏信息栏（Modal 形态，与宽屏常驻列同源同逻辑） */}
      <Modal open={!isWide && infoModalOpen} onClose={() => setInfoModalOpen(false)} title="文章设置">
        <div className="h-[60vh]">
          <EditorInfoPanel
            value={form}
            onChange={updateForm}
            slug={slug}
            onSlugChange={handleSlugChange}
            onCoverFile={(f) => void handleCoverFile(f)}
            coverUploading={coverUploading}
            onOpenDataCard={() => {
              setInfoModalOpen(false);
              setDataCardOpen(true);
            }}
          />
        </div>
      </Modal>

      {/* 冲突处理对话框 */}
      <Modal open={conflictOpen} onClose={() => undefined} title="检测到编辑冲突">
        <div className="space-y-4 text-sm">
          <p style={{ color: "var(--color-text-secondary)" }}>
            这篇文章已在另一个窗口被修改。为避免静默覆盖，请选择要保留的版本：
          </p>
          {!serverSnapshot && (
            <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
              <Loader2 size={12} className="animate-spin" />
              正在获取服务端版本…
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary text-xs" onClick={() => void resolveKeepLocal()}>
              保留本地版本（覆盖服务端）
            </button>
            <button type="button" className="btn btn-ghost text-xs" onClick={() => void resolveKeepServer()} disabled={!serverSnapshot}>
              保留服务端版本（放弃本地修改）
            </button>
            <button
              type="button"
              className="btn btn-ghost text-xs"
              disabled={!serverSnapshot}
              onClick={() => setComparisonOpen((v) => !v)}
            >
              {comparisonOpen ? "收起对比" : "对比查看"}
            </button>
          </div>
          {comparisonOpen && serverSnapshot && (
            <div className="space-y-2">
              <p className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                服务端版本（{timeHms(new Date(serverSnapshot.updatedAt))} 保存）
              </p>
              <pre
                className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border p-3 text-xs leading-relaxed"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                {serverSnapshot.contentMd.slice(0, 4000) || "（正文为空）"}
                {serverSnapshot.contentMd.length > 4000 ? "\n……（截断预览）" : ""}
              </pre>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function ViewModeButton({
  active,
  title,
  onClick,
  icon: Icon,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number }>;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      className="rounded px-1.5 py-1 transition-colors"
      style={{
        color: active ? "var(--color-primary)" : "var(--color-text-muted)",
        backgroundColor: active ? "color-mix(in srgb, var(--color-primary) 9%, transparent)" : "transparent",
      }}
      onClick={onClick}
    >
      <Icon size={15} strokeWidth={1.8} />
    </button>
  );
}
