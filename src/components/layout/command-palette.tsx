"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Clock,
  Flame,
  ListChecks,
  LogOut,
  Moon,
  Palette,
  PenLine,
  Search,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { MODULES } from "@/config/modules";
import { THEMES, resolveMode } from "@/lib/theme/tokens";
import { useTheme } from "@/components/theme/theme-provider";
import { useToast } from "@/components/feedback/toast";
import { logoutAction } from "@/modules/auth/actions/auth-actions";

const RECENT_LS_KEY = "wb_recent_pages";
const MAX_RECENT = 5;

type RecentPage = { path: string; name: string; at: number };

/** 记录一次页面访问（仅存本地 localStorage，不上报服务端 —— 符合平台隐私基调） */
export function recordPageVisit(pathname: string) {
  if (typeof window === "undefined") return;
  const mod = MODULES.find((m) => pathname === m.path || pathname.startsWith(`${m.path}/`));
  const name = mod?.name ?? (pathname.startsWith("/settings") ? "设置" : null);
  if (!name) return;
  try {
    const raw = window.localStorage.getItem(RECENT_LS_KEY);
    const list: RecentPage[] = raw ? JSON.parse(raw) : [];
    const next = [
      { path: pathname, name, at: Date.now() },
      ...list.filter((r) => r.path !== pathname),
    ].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_LS_KEY, JSON.stringify(next));
  } catch {
    /* localStorage 不可用时静默降级 */
  }
}

function readRecent(): RecentPage[] {
  try {
    const raw = window.localStorage.getItem(RECENT_LS_KEY);
    return raw ? (JSON.parse(raw) as RecentPage[]) : [];
  } catch {
    return [];
  }
}

type Command = {
  id: string;
  group: "跳转" | "操作" | "最近访问";
  icon: LucideIcon;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
};

/**
 * 命令面板（优化文档 §3.6）——“让用户不用找”。
 * Ctrl/Cmd + K 唤起；↑↓ 移动、Enter 确认、Esc 关闭；
 * 打开动效：遮罩淡入 160ms + 面板 scale(0.98)→1 / translateY(4px)→0 200ms。
 */
export function CommandPalette({ isGuest }: { isGuest: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { themeName, colorMode, setTheme, setMode } = useTheme();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // 全局快捷键 + 侧边栏/顶栏触发事件
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("wb:open-command-palette", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("wb:open-command-palette", onOpen);
    };
  }, []);

  // 打开时重置状态并自动聚焦
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  const go = useCallback(
    (path: string) => {
      close();
      router.push(path);
    },
    [close, router],
  );

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = MODULES.map((m) => ({
      id: `nav-${m.key}`,
      group: "跳转",
      icon: m.icon,
      label: m.name,
      hint: m.group === "core" ? "核心" : m.group === "content" ? "内容" : "工具",
      keywords: `${m.name} ${m.key} ${m.description}`,
      run: () => go(m.path),
    }));
    nav.push({
      id: "nav-settings",
      group: "跳转",
      icon: Settings,
      label: "设置",
      hint: "偏好",
      keywords: "设置 settings 外观 主题",
      run: () => go("/settings"),
    });

    const resolved = resolveMode(colorMode);
    const currentThemeIdx = THEMES.findIndex((t) => t.id === themeName);
    const nextTheme =
      THEMES[(currentThemeIdx + 1) % THEMES.length] ??
      ({ id: themeName, name: themeName } as (typeof THEMES)[number]);
    const actions: Command[] = [
      {
        id: "act-new-task",
        group: "操作",
        icon: ListChecks,
        label: "新建任务",
        hint: "任务清单",
        keywords: "新建 任务 new task",
        run: () => go("/tasks?create=1"),
      },
      {
        id: "act-new-habit",
        group: "操作",
        icon: Flame,
        label: "新建习惯",
        hint: "习惯打卡",
        keywords: "新建 习惯 new habit",
        run: () => go("/habits?create=1"),
      },
      {
        id: "act-write",
        group: "操作",
        icon: PenLine,
        label: "写文章",
        hint: "博客",
        keywords: "写文章 博客 new post write",
        run: () => go("/blog/new"),
      },
      {
        id: "act-mode",
        group: "操作",
        icon: resolved === "dark" ? Sun : Moon,
        label: resolved === "dark" ? "切换到浅色模式" : "切换到深色模式",
        hint: "外观",
        keywords: "深色 浅色 明暗 模式 dark light mode",
        run: () => {
          setMode(resolved === "dark" ? "light" : "dark");
          close();
        },
      },
      {
        id: "act-theme",
        group: "操作",
        icon: Palette,
        label: `切换主题（当前：${THEMES.find((t) => t.id === themeName)?.name ?? themeName}）`,
        hint: `下一套：${nextTheme.name}`,
        keywords: "主题 配色 theme color",
        run: () => {
          setTheme(nextTheme.id);
          close();
        },
      },
      {
        id: "act-logout",
        group: "操作",
        icon: LogOut,
        label: isGuest ? "退出访客模式" : "退出登录",
        hint: "账户",
        keywords: "退出 登出 logout signout",
        run: () => {
          close();
          void logoutAction().then((res) => {
            if (res.success) {
              toast.success("已退出登录");
              router.push("/login");
              router.refresh();
            }
          });
        },
      },
    ];

    const recent: Command[] = readRecent()
      .filter((r) => r.path !== pathname)
      .map((r) => ({
        id: `recent-${r.path}`,
        group: "最近访问" as const,
        icon: Clock,
        label: r.name,
        hint: r.path,
        keywords: `${r.name} ${r.path}`,
        run: () => go(r.path),
      }));

    return [...recent, ...nav, ...actions];
  }, [go, pathname, colorMode, themeName, setMode, setTheme, close, isGuest, router, toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    // 匹配质量打分：名称开头 > 名称包含 > 描述/关键词命中。
    // 否则“习惯”会把描述里带「习惯」的总览排到习惯打卡前面。
    const scored = commands
      .map((c) => {
        const label = c.label.toLowerCase();
        let score = 0;
        if (label.startsWith(q)) score = 3;
        else if (label.includes(q)) score = 2;
        else if (c.hint?.toLowerCase().includes(q) || c.keywords?.toLowerCase().includes(q)) score = 1;
        return { c, score };
      })
      .filter((s) => s.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.c);
  }, [commands, query]);

  const isSearching = query.trim().length > 0;

  // 无查询时按组分节（最近访问 → 跳转 → 操作）；有查询时按匹配分扁平排列（ VS Code 式 ）
  const sections = useMemo(() => {
    if (isSearching) {
      return [{ group: "结果" as const, items: filtered }];
    }
    const order: Command["group"][] = ["最近访问", "跳转", "操作"];
    return order
      .map((g) => ({ group: g, items: filtered.filter((c) => c.group === g) }))
      .filter((s) => s.items.length > 0);
  }, [filtered, isSearching]);

  // 键盘导航（光标索引基于扁平化 filtered 列表）
  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        filtered[cursor]?.run();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, filtered, cursor, close]);

  // 光标项滚动到可视区域
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  let flatIndex = -1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-start justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.32)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.14 } }}
          transition={{ duration: 0.16 }}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="命令面板"
        >
          <motion.div
            className="mt-[20vh] w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-[var(--radius-lg)]"
            style={{
              backgroundColor: "var(--color-bg-elevated)",
              boxShadow: "var(--shadow-lg)",
              maxHeight: 420,
            }}
            initial={{ scale: 0.98, y: 4, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.98, y: 4, opacity: 0, transition: { duration: 0.14 } }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 输入框 */}
            <div className="flex h-12 items-center gap-3 px-4">
              <Search size={17} style={{ color: "var(--color-text-muted)" }} aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索页面或操作…"
                aria-label="搜索页面或操作"
                className="h-full flex-1 bg-transparent text-[15px] outline-none"
                style={{ color: "var(--color-text-primary)" }}
              />
              <kbd
                className="rounded px-1.5 py-0.5 text-[10px]"
                style={{
                  backgroundColor: "var(--color-bg-surface)",
                  color: "var(--color-text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                ESC
              </kbd>
            </div>
            <div className="h-px" style={{ backgroundColor: "color-mix(in srgb, var(--color-border) 50%, transparent)" }} />

            {/* 结果列表 */}
            <div ref={listRef} className="max-h-[360px] overflow-y-auto p-2" role="listbox">
              {sections.length === 0 && (
                <div className="px-3 py-10 text-center">
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    没有找到「{query}」
                  </p>
                  <button
                    type="button"
                    className="link-draw mt-2 text-sm"
                    style={{ color: "var(--color-primary)" }}
                    onClick={() => go(`/blog/search?q=${encodeURIComponent(query)}`)}
                  >
                    试试搜索文章？
                  </button>
                </div>
              )}
              {sections.map((section) => (
                <div key={section.group} className="mb-1 last:mb-0">
                  <p
                    className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {section.group}
                  </p>
                  <ul>
                    {section.items.map((cmd) => {
                      flatIndex += 1;
                      const idx = flatIndex;
                      const selected = idx === cursor;
                      const Icon = cmd.icon;
                      return (
                        <li key={cmd.id}>
                          <button
                            type="button"
                            data-index={idx}
                            role="option"
                            aria-selected={selected}
                            onMouseEnter={() => setCursor(idx)}
                            onClick={cmd.run}
                            className="relative flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left transition-colors duration-100"
                            style={{
                              backgroundColor: selected
                                ? "color-mix(in srgb, var(--color-primary) 12%, transparent)"
                                : "transparent",
                              color: "var(--color-text-primary)",
                            }}
                          >
                            {selected && (
                              <span
                                aria-hidden
                                className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full"
                                style={{ backgroundColor: "var(--color-primary)" }}
                              />
                            )}
                            <Icon
                              size={16}
                              className="shrink-0"
                              style={{ color: selected ? "var(--color-primary)" : "var(--color-text-muted)" }}
                              aria-hidden
                            />
                            <span className="flex-1 truncate text-sm">{cmd.label}</span>
                            {cmd.hint && (
                              <span className="shrink-0 text-xs" style={{ color: "var(--color-text-muted)" }}>
                                {cmd.hint}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 供 shell 使用：路由变化时记录最近访问 */
export function useRecentPageTracker() {
  const pathname = usePathname();
  useEffect(() => {
    recordPageVisit(pathname);
  }, [pathname]);
}
