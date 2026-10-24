"use client";

import { useEffect, useState } from "react";
import { AArrowDown, AArrowUp } from "lucide-react";

/**
 * 编辑器排版设置条（Office 式）：字体 + 字号即时调节，作用于编辑器与预览区。
 * 字体下拉项直接以该字体渲染（所见即所得）；偏好持久化到 localStorage，
 * 只影响编辑/预览显示，不改变发布的 Markdown 内容。
 */

/** 30 种主流字体（web-safe + 中文系统字体栈） */
export const FONTS: { key: string; label: string; stack: string }[] = [
  { key: "default", label: "默认字体", stack: "" },
  { key: "songti", label: "宋体", stack: '"Songti SC", SimSun, "Noto Serif SC", serif' },
  { key: "heiti", label: "黑体", stack: '"Heiti SC", SimHei, "Microsoft YaHei", sans-serif' },
  { key: "kaiti", label: "楷体", stack: '"Kaiti SC", KaiTi, STKaiti, serif' },
  { key: "fangsong", label: "仿宋", stack: '"FangSong", "STFangsong", "仿宋", serif' },
  { key: "yahei", label: "微软雅黑", stack: '"Microsoft YaHei", "PingFang SC", sans-serif' },
  { key: "pingfang", label: "苹方", stack: '"PingFang SC", "Hiragino Sans GB", sans-serif' },
  { key: "noto-serif-sc", label: "思源宋体", stack: '"Noto Serif SC", "Source Han Serif SC", serif' },
  { key: "noto-sans-sc", label: "思源黑体", stack: '"Noto Sans SC", "Source Han Sans SC", sans-serif' },
  { key: "dengxian", label: "等线", stack: 'DengXian, "等线", "Microsoft YaHei", sans-serif' },
  { key: "lishu", label: "隶书", stack: 'LiSu, "隶书", "STLiti", serif' },
  { key: "youyuan", label: "幼圆", stack: 'YouYuan, "幼圆", "STYuanti", sans-serif' },
  { key: "xingkai", label: "行楷", stack: '"STXingkai", "华文行楷", KaiTi, serif' },
  { key: "weibei", label: "微软雅黑粗", stack: '"Microsoft YaHei UI", "Microsoft YaHei", sans-serif' },
  { key: "arial", label: "Arial", stack: 'Arial, Helvetica, sans-serif' },
  { key: "helvetica", label: "Helvetica", stack: 'Helvetica, "Helvetica Neue", Arial, sans-serif' },
  { key: "times", label: "Times New Roman", stack: '"Times New Roman", Times, serif' },
  { key: "georgia", label: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
  { key: "garamond", label: "Garamond", stack: 'Garamond, "EB Garamond", serif' },
  { key: "palatino", label: "Palatino", stack: 'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
  { key: "verdana", label: "Verdana", stack: 'Verdana, Geneva, sans-serif' },
  { key: "tahoma", label: "Tahoma", stack: 'Tahoma, Verdana, sans-serif' },
  { key: "trebuchet", label: "Trebuchet MS", stack: '"Trebuchet MS", sans-serif' },
  { key: "courier", label: "Courier New", stack: '"Courier New", Courier, monospace' },
  { key: "consolas", label: "Consolas", stack: 'Consolas, "JetBrains Mono", monospace' },
  { key: "jetbrains", label: "JetBrains Mono", stack: '"JetBrains Mono", Consolas, monospace' },
  { key: "fira-code", label: "Fira Code", stack: '"Fira Code", Consolas, monospace' },
  { key: "impact", label: "Impact", stack: 'Impact, Haettenschweiler, sans-serif' },
  { key: "comic", label: "Comic Sans MS", stack: '"Comic Sans MS", "Comic Neue", cursive' },
  { key: "system-ui", label: "系统默认", stack: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
];

const SIZES = [13, 14, 15, 16, 17, 18, 20, 22, 24];

const LS_KEY = "pwb-editor-typography";

type Prefs = { font: string; size: number };

function load(): Prefs {
  if (typeof window === "undefined") return { font: "default", size: 16 };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Prefs;
      if (typeof p.font === "string" && typeof p.size === "number") return p;
    }
  } catch {
    // ignore
  }
  return { font: "default", size: 16 };
}

export function EditorTypographyBar({ targetSelector }: { targetSelector: string }) {
  const [prefs, setPrefs] = useState<Prefs>({ font: "default", size: 16 });

  useEffect(() => {
    setPrefs(load());
  }, []);

  useEffect(() => {
    const stack = FONTS.find((f) => f.key === prefs.font)?.stack ?? "";
    const els = document.querySelectorAll<HTMLElement>(targetSelector);
    els.forEach((el) => {
      el.style.fontFamily = stack;
      el.style.fontSize = `${prefs.size}px`;
    });
  }, [prefs, targetSelector]);

  function update(patch: Partial<Prefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="排版设置">
      <select
        className="input !w-auto !py-1 text-xs"
        value={prefs.font}
        onChange={(e) => update({ font: e.target.value })}
        aria-label="编辑器字体"
        title="编辑器字体"
        // 下拉项以该字体本身渲染（所见即所得）
        style={{ fontFamily: FONTS.find((f) => f.key === prefs.font)?.stack || undefined }}
      >
        {FONTS.map((f) => (
          <option key={f.key} value={f.key} style={{ fontFamily: f.stack || undefined }}>
            {f.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="icon-btn !h-7 !w-7"
        aria-label="减小字号"
        title="减小字号"
        onClick={() => update({ size: Math.max(SIZES[0]!, prefs.size - 1) })}
      >
        <AArrowDown size={15} />
      </button>
      <span className="w-8 text-center text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
        {prefs.size}
      </span>
      <button
        type="button"
        className="icon-btn !h-7 !w-7"
        aria-label="增大字号"
        title="增大字号"
        onClick={() => update({ size: Math.min(SIZES[SIZES.length - 1]!, prefs.size + 1) })}
      >
        <AArrowUp size={15} />
      </button>
    </div>
  );
}
