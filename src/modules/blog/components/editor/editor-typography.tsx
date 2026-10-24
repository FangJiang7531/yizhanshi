"use client";

import { useEffect, useState } from "react";
import { AArrowDown, AArrowUp } from "lucide-react";

/**
 * 编辑器排版设置条（Office 式）：字体 + 字号即时调节，作用于编辑器与预览区。
 * 偏好持久化到 localStorage（per 浏览器），不影响发布内容——发布内容保持干净 Markdown。
 */

const FONTS: { key: string; label: string; stack: string }[] = [
  { key: "default", label: "默认字体", stack: "" },
  { key: "songti", label: "宋体", stack: '"Songti SC", "SimSun", serif' },
  { key: "heiti", label: "黑体", stack: '"Heiti SC", "SimHei", "Microsoft YaHei", sans-serif' },
  { key: "kaiti", label: "楷体", stack: '"Kaiti SC", "KaiTi", "STKaiti", serif' },
  { key: "fangsong", label: "仿宋", stack: '"FangSong", "STFangsong", serif' },
  { key: "mono", label: "等宽", stack: 'var(--font-mono)' },
  { key: "serif-en", label: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
  { key: "sans-en", label: "Verdana", stack: 'Verdana, Geneva, sans-serif' },
];

const SIZES = [14, 15, 16, 17, 18, 20, 22];

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
      >
        {FONTS.map((f) => (
          <option key={f.key} value={f.key}>
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
