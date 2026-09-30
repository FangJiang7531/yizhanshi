"use client";

import type { RefObject } from "react";
import {
  Bold,
  Code,
  Database,
  Heading2,
  Heading3,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Strikethrough,
  Table,
} from "lucide-react";
import type { MarkdownEditorHandle } from "./markdown-editor";

/**
 * 编辑器工具栏（PRD §5.2.2 工具栏）。
 * 纯展示 + 命令转发：所有编辑动作经 MarkdownEditorHandle 落入 CodeMirror 事务，
 * 不经过 React state（保持撤销栈完整）。
 */

type ToolButton = {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number }>;
  run: (editor: MarkdownEditorHandle) => void;
};

const GROUPS: ToolButton[][] = [
  [
    { key: "bold", label: "加粗 (Ctrl+B)", icon: Bold, run: (e) => e.wrapSelection("**") },
    { key: "italic", label: "斜体 (Ctrl+I)", icon: Italic, run: (e) => e.wrapSelection("*") },
    { key: "strike", label: "删除线", icon: Strikethrough, run: (e) => e.wrapSelection("~~") },
    { key: "code-inline", label: "行内代码 (Ctrl+E)", icon: Code, run: (e) => e.wrapSelection("`") },
  ],
  [
    { key: "h2", label: "二级标题", icon: Heading2, run: (e) => e.toggleLinePrefix("## ", /^#+\s/) },
    { key: "h3", label: "三级标题", icon: Heading3, run: (e) => e.toggleLinePrefix("### ", /^#+\s/) },
    { key: "quote", label: "引用", icon: Quote, run: (e) => e.toggleLinePrefix("> ") },
  ],
  [
    { key: "ul", label: "无序列表", icon: List, run: (e) => e.toggleLinePrefix("- ") },
    { key: "ol", label: "有序列表", icon: ListOrdered, run: (e) => e.toggleLinePrefix("1. ") },
    { key: "task", label: "任务列表", icon: ListTodo, run: (e) => e.toggleLinePrefix("- [ ] ") },
  ],
  [
    { key: "link", label: "链接 (Ctrl+K)", icon: Link, run: (e) => e.insertLink() },
    { key: "image", label: "图片", icon: Image, run: () => undefined },
  ],
  [
    {
      key: "code-block",
      label: "代码块",
      icon: Code,
      run: (e) => e.insertText("\n```\n\n```\n"),
    },
    {
      key: "table",
      label: "表格",
      icon: Table,
      run: (e) => e.insertText("\n| 表头 | 表头 |\n| --- | --- |\n| 单元格 | 单元格 |\n"),
    },
    { key: "hr", label: "分割线", icon: Minus, run: (e) => e.insertText("\n---\n") },
  ],
];

export function EditorToolbar({
  editorRef,
  onPickImage,
  onOpenDataCard,
  disabled,
}: {
  editorRef: RefObject<MarkdownEditorHandle | null>;
  /** 图片按钮：打开文件选择（上传逻辑在 shell） */
  onPickImage: () => void;
  /** 打开"插入数据卡片"面板 */
  onOpenDataCard: () => void;
  disabled?: boolean;
}) {
  function handleClick(btn: ToolButton) {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    if (btn.key === "image") {
      onPickImage();
      return;
    }
    btn.run(editor);
  }

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1"
      style={{ borderColor: "var(--color-border)" }}
      role="toolbar"
      aria-label="编辑工具栏"
    >
      {GROUPS.map((group, gi) => (
        <div key={gi} className="flex items-center">
          {gi > 0 && (
            <span
              className="mx-1 h-4 w-px shrink-0"
              style={{ backgroundColor: "var(--color-border)" }}
              aria-hidden
            />
          )}
          {group.map((btn) => (
            <button
              key={btn.key}
              type="button"
              title={btn.label}
              aria-label={btn.label}
              className="editor-tool-btn"
              onClick={() => handleClick(btn)}
              disabled={disabled}
            >
              <btn.icon size={15} strokeWidth={1.8} />
            </button>
          ))}
        </div>
      ))}
      <span className="mx-1 h-4 w-px shrink-0" style={{ backgroundColor: "var(--color-border)" }} aria-hidden />
      <button
        type="button"
        title="插入数据卡片"
        aria-label="插入数据卡片"
        className="editor-tool-btn editor-tool-btn-wide"
        onClick={onOpenDataCard}
        disabled={disabled}
      >
        <Database size={15} strokeWidth={1.8} />
        <span className="text-xs">数据卡片</span>
      </button>
    </div>
  );
}
