"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  MODE_LS_KEY,
  MOTION_LS_KEY,
  THEME_LS_KEY,
  resolveMode,
  type ColorMode,
  type ThemeName,
} from "@/lib/theme/tokens";

type Preferences = {
  themeName: ThemeName;
  colorMode: ColorMode;
  motionEnabled: boolean;
  setTheme: (t: ThemeName) => void;
  setMode: (m: ColorMode) => void;
  setMotion: (on: boolean) => void;
};

const ThemeContext = createContext<Preferences | null>(null);

function applyToDom(theme: ThemeName, mode: ColorMode) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-mode", resolveMode(mode));
}

/**
 * 主题 Provider：外观是平台级能力。
 * 已登录用户的初始值由服务端注入（UserSetting），访客走 localStorage；此后统一由本 Provider 管理。
 */
export function ThemeProvider({
  children,
  initialTheme,
  initialMode,
  initialMotion,
  persistToServer,
}: {
  children: ReactNode;
  initialTheme?: ThemeName;
  initialMode?: ColorMode;
  initialMotion?: boolean;
  persistToServer?: (prefs: { themeName: ThemeName; colorMode: ColorMode; motionEnabled: boolean }) => Promise<void>;
}) {
  const [themeName, setThemeName] = useState<ThemeName>(initialTheme ?? DEFAULT_THEME);
  const [colorMode, setColorMode] = useState<ColorMode>(initialMode ?? DEFAULT_MODE);
  const [motionEnabled, setMotionEnabled] = useState<boolean>(initialMotion ?? true);

  // 客户端挂载后校正：
  // - 已登录（服务端注入了 UserSetting 值）→ 以服务端值为准并覆盖 DOM（换设备主题跟随，A-15）
  // - 访客 → 从 localStorage 读取（与防闪烁脚本一致）
  useEffect(() => {
    if (initialTheme && initialMode) {
      applyToDom(initialTheme, initialMode);
      return;
    }
    const t = (localStorage.getItem(THEME_LS_KEY) as ThemeName | null) ?? DEFAULT_THEME;
    const m = (localStorage.getItem(MODE_LS_KEY) as ColorMode | null) ?? DEFAULT_MODE;
    const mo = localStorage.getItem(MOTION_LS_KEY);
    setThemeName(t);
    setColorMode(m);
    if (mo === "off") setMotionEnabled(false);
    applyToDom(t, m);
  }, [initialTheme, initialMode]);

  // system 模式跟随系统变化
  useEffect(() => {
    if (colorMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyToDom(themeName, colorMode);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [themeName, colorMode]);

  const persist = useCallback(
    (t: ThemeName, m: ColorMode, motion: boolean) => {
      if (persistToServer) {
        void persistToServer({ themeName: t, colorMode: m, motionEnabled: motion });
      }
    },
    [persistToServer],
  );

  const setTheme = useCallback(
    (t: ThemeName) => {
      setThemeName(t);
      localStorage.setItem(THEME_LS_KEY, t);
      applyToDom(t, colorMode);
      persist(t, colorMode, motionEnabled);
    },
    [colorMode, motionEnabled, persist],
  );

  const setMode = useCallback(
    (m: ColorMode) => {
      setColorMode(m);
      localStorage.setItem(MODE_LS_KEY, m);
      applyToDom(themeName, m);
      persist(themeName, m, motionEnabled);
    },
    [themeName, motionEnabled, persist],
  );

  const setMotion = useCallback(
    (on: boolean) => {
      setMotionEnabled(on);
      localStorage.setItem(MOTION_LS_KEY, on ? "on" : "off");
      if (on) {
        document.documentElement.removeAttribute("data-motion");
      } else {
        document.documentElement.setAttribute("data-motion", "off");
      }
      persist(themeName, colorMode, on);
    },
    [themeName, colorMode, persist],
  );

  return (
    <ThemeContext.Provider value={{ themeName, colorMode, motionEnabled, setTheme, setMode, setMotion }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Preferences {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme 必须在 ThemeProvider 内使用");
  return ctx;
}
