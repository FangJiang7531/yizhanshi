"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";
import type { EditorView as EditorViewType } from "@codemirror/view";

/**
 * Markdown 编辑器（CodeMirror 6 封装，PRD §5.2.2 / 制作流程 Step 5.3）。
 *
 * 设计：**非受控内核 + 受控外壳**。
 * CodeMirror 自持文档与撤销栈（受控模式会让每次击键都经历
 * dispatch → setState → 再 dispatch 的回环，光标与输入法都会出问题）；
 * React 的 `value` 只在"外部替换"（恢复本地备份、换文章）时报到，
 * 且替换前先与当前文档比对，避免无谓重写。
 *
 * 扩展组成：行号 / 撤销栈 / 括号匹配 / 折叠……见 buildExtensions；
 * 所有回调经 ref 透传，"最新回调"不会因扩展在创建时闭包过期而失效。
 */

const FONT_STACK = 'var(--font-mono, "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)';

/** 编辑器主题：全量走主题 CSS 变量，6 主题 × 明暗自动跟随（策划文档 §2.3 零硬编码） */
const editorTheme = EditorView.theme({
  "&": {
    fontSize: "15px",
    lineHeight: "1.7",
    fontFamily: FONT_STACK,
    color: "var(--color-text-primary)",
    backgroundColor: "transparent",
    height: "100%",
  },
  ".cm-scroller": { fontFamily: FONT_STACK, lineHeight: "1.7", padding: "4px 0" },
  ".cm-content": { padding: "10px 0", caretColor: "var(--color-primary)" },
  ".cm-line": { padding: "0 18px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-primary)", borderLeftWidth: "2px" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid var(--color-border)",
    color: "var(--color-text-muted)",
    fontSize: "12px",
    paddingLeft: "4px",
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--color-primary) 5%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--color-text-secondary)" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--color-primary) 18%, transparent)",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--color-primary) 26%, transparent)",
  },
  ".cm-matchingBracket, .cm-nonmatchingBracket": {
    backgroundColor: "color-mix(in srgb, var(--color-primary) 22%, transparent)",
    outline: "none",
  },
  ".cm-placeholder": { color: "var(--color-text-muted)" },
});

/** Markdown 高亮：语义色映射（不是代码块那套深色调色板——这是浅底编辑器） */
const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: "700", fontSize: "1.42em" },
  { tag: tags.heading2, fontWeight: "700", fontSize: "1.26em" },
  { tag: tags.heading3, fontWeight: "650", fontSize: "1.12em" },
  { tag: tags.heading4, fontWeight: "650" },
  { tag: tags.heading5, fontWeight: "650" },
  { tag: tags.heading6, fontWeight: "650" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--color-primary)" },
  { tag: tags.url, color: "var(--color-text-muted)" },
  { tag: tags.monospace, color: "var(--color-accent)" },
  { tag: tags.quote, color: "var(--color-text-secondary)", fontStyle: "italic" },
  { tag: tags.list, color: "var(--color-text-secondary)" },
  { tag: tags.processingInstruction, color: "var(--color-text-muted)" },
  { tag: tags.meta, color: "var(--color-text-muted)" },
  { tag: tags.contentSeparator, color: "var(--color-text-muted)" },
]);

// ---------- 选区操作（handle 方法与快捷键共用同一批纯函数）----------

/** 包裹选中文本；无选区时插入一对标记并把光标放中间；已包裹则去除（toggle） */
function wrapSelectionInView(view: EditorViewType, marker: string, endMarker?: string): void {
  const end = endMarker ?? marker;
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  // 已包裹 → 取消
  const before = view.state.sliceDoc(Math.max(0, from - marker.length), from);
  const after = view.state.sliceDoc(to, Math.min(view.state.doc.length, to + end.length));
  if (selected && before === marker && after === end) {
    view.dispatch({
      changes: [
        { from: from - marker.length, to: from, insert: "" },
        { from: to, to: to + end.length, insert: "" },
      ],
      selection: { anchor: from - marker.length, head: to - marker.length },
    });
    view.focus();
    return;
  }

  const insert = `${marker}${selected}${end}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: selected
      ? { anchor: from + marker.length, head: from + marker.length + selected.length }
      : { anchor: from + marker.length },
  });
  view.focus();
}

/** 插入链接：有选区则为 [选区](url)，否则插入 [文本](url) 并选中"文本"占位 */
function insertLinkInView(view: EditorViewType): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const text = selected || "链接文字";
  const insert = `[${text}](url)`;
  const textStart = from + 1;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: textStart, head: textStart + text.length },
  });
  view.focus();
}

/**
 * 行级前缀切换（引用 / 标题 / 列表）。
 * strip 提供时先移除同类前缀再加新的（如标题从 `## ` 切到 `### `）。
 */
function toggleLinePrefixInView(view: EditorViewType, prefix: string, strip?: RegExp): void {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const startLine = doc.lineAt(from).number;
  const endLine = doc.lineAt(to).number;

  const lines = [];
  for (let n = startLine; n <= endLine; n++) lines.push(doc.line(n));
  const allHave = lines.every((l) => l.text.startsWith(prefix));

  const changes: { from: number; to?: number; insert: string }[] = [];
  for (const line of lines) {
    if (allHave) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: "" });
      continue;
    }
    const match = strip ? strip.exec(line.text) : null;
    if (match) {
      changes.push({ from: line.from, to: line.from + match[0].length, insert: prefix });
    } else {
      changes.push({ from: line.from, insert: prefix });
    }
  }
  view.dispatch({ changes });
  view.focus();
}

// ---------- 组件 ----------

export type MarkdownEditorHandle = {
  insertText: (text: string) => void;
  wrapSelection: (marker: string, endMarker?: string) => void;
  insertLink: () => void;
  toggleLinePrefix: (prefix: string, strip?: RegExp) => void;
  focus: () => void;
  /** 当前文档（绕过 React state 拿最新值） */
  getDoc: () => string;
};

export type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** 光标位置（状态栏"行:列"） */
  onCursorChange?: (info: { line: number; col: number }) => void;
  /** Cmd/Ctrl+S */
  onSave?: () => void;
  /** Cmd/Ctrl+Enter */
  onPublish?: () => void;
  /** 粘贴 / 拖入图片文件（由外壳上传并插入 Markdown） */
  onPasteFile?: (file: File) => void;
  /** 滚动位置比例 0–1（编辑区 → 预览区同步滚动） */
  onScrollRatio?: (ratio: number) => void;
  placeholder?: string;
  className?: string;
  ref?: Ref<MarkdownEditorHandle>;
};

export function MarkdownEditor({
  value,
  onChange,
  onCursorChange,
  onSave,
  onPublish,
  onPasteFile,
  onScrollRatio,
  placeholder,
  className,
  ref,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorViewType | null>(null);
  const initialDocRef = useRef(value);

  /** 最新回调（扩展创建时闭包会过期，一律经此 ref 读取） */
  const callbacksRef = useRef({ onChange, onCursorChange, onSave, onPublish, onPasteFile, onScrollRatio });
  useEffect(() => {
    callbacksRef.current = { onChange, onCursorChange, onSave, onPublish, onPasteFile, onScrollRatio };
  });

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    const state = EditorState.create({
      doc: initialDocRef.current,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        indentOnInput(),
        bracketMatching(),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(markdownHighlightStyle),
        EditorView.lineWrapping,
        cmPlaceholder(placeholder ?? "开始写作…（支持 Markdown 语法）"),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            callbacksRef.current.onChange(update.state.doc.toString());
          }
          if (update.docChanged || update.selectionSet) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            callbacksRef.current.onCursorChange?.({ line: line.number, col: head - line.from + 1 });
          }
        }),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              callbacksRef.current.onSave?.();
              return true;
            },
          },
          {
            key: "Mod-Enter",
            preventDefault: true,
            run: () => {
              callbacksRef.current.onPublish?.();
              return true;
            },
          },
          {
            key: "Mod-b",
            run: (view) => {
              wrapSelectionInView(view, "**");
              return true;
            },
          },
          {
            key: "Mod-i",
            run: (view) => {
              wrapSelectionInView(view, "*");
              return true;
            },
          },
          {
            key: "Mod-k",
            run: (view) => {
              insertLinkInView(view);
              return true;
            },
          },
          {
            key: "Mod-e",
            run: (view) => {
              wrapSelectionInView(view, "`");
              return true;
            },
          },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.domEventHandlers({
          paste: (event) => {
            const files = event.clipboardData?.files;
            if (!files || files.length === 0) return false;
            const image = Array.from(files).find((f) => f.type.startsWith("image/"));
            if (!image) return false;
            event.preventDefault();
            callbacksRef.current.onPasteFile?.(image);
            return true;
          },
          drop: (event) => {
            const files = event.dataTransfer?.files;
            if (!files || files.length === 0) return false;
            const image = Array.from(files).find((f) => f.type.startsWith("image/"));
            if (!image) return false;
            event.preventDefault();
            callbacksRef.current.onPasteFile?.(image);
            return true;
          },
          scroll: (_event, view) => {
            const el = view.scrollDOM;
            const max = el.scrollHeight - el.clientHeight;
            callbacksRef.current.onScrollRatio?.(max > 0 ? el.scrollTop / max : 0);
            return false;
          },
        }),
        editorTheme,
      ],
    });

    const view = new EditorView({ state, parent });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 仅初始化一次：value 的后续变化由下方同步 effect 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部替换（恢复本地备份 / 切换文章）：仅当与服务端文档不同才重写
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  const getView = useCallback(() => viewRef.current, []);

  useImperativeHandle(
    ref,
    () => ({
      insertText(text: string) {
        const view = getView();
        if (!view) return;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
        view.focus();
      },
      wrapSelection(marker: string, endMarker?: string) {
        const view = getView();
        if (view) wrapSelectionInView(view, marker, endMarker);
      },
      insertLink() {
        const view = getView();
        if (view) insertLinkInView(view);
      },
      toggleLinePrefix(prefix: string, strip?: RegExp) {
        const view = getView();
        if (view) toggleLinePrefixInView(view, prefix, strip);
      },
      focus() {
        getView()?.focus();
      },
      getDoc() {
        return getView()?.state.doc.toString() ?? "";
      },
    }),
    [getView],
  );

  return <div ref={containerRef} className={className ?? "h-full"} data-testid="markdown-editor" />;
}
