export type ThemeName =
  | "classic-paper"
  | "tech"
  | "botanical"
  | "minimal"
  | "pure-white"
  | "pure-black";

export type ColorMode = "light" | "dark" | "system";

export const THEMES: { id: ThemeName; name: string; swatch: { bg: string; fg: string; accent: string } }[] = [
  { id: "classic-paper", name: "米黄书页", swatch: { bg: "#FAF6ED", fg: "#3A3226", accent: "#8B6F47" } },
  { id: "tech", name: "科技感", swatch: { bg: "#0A0E1A", fg: "#E6F1FF", accent: "#00D4FF" } },
  { id: "botanical", name: "植物绿", swatch: { bg: "#F4F9F4", fg: "#24352A", accent: "#4A7C59" } },
  { id: "minimal", name: "现代简约", swatch: { bg: "#FFFFFF", fg: "#18181B", accent: "#6366F1" } },
  { id: "pure-white", name: "纯白", swatch: { bg: "#FFFFFF", fg: "#000000", accent: "#000000" } },
  { id: "pure-black", name: "纯黑", swatch: { bg: "#000000", fg: "#FFFFFF", accent: "#FFFFFF" } },
];

export const DEFAULT_THEME: ThemeName = "classic-paper";
export const DEFAULT_MODE: ColorMode = "system";

export const THEME_LS_KEY = "pwb-theme";
export const MODE_LS_KEY = "pwb-mode";
export const MOTION_LS_KEY = "pwb-motion";
export const DENSITY_LS_KEY = "pwb-density";
export const FONTSIZE_LS_KEY = "pwb-fontsize";

/** 首屏防闪烁内联脚本：在 HTML 解析阶段就写好 data-theme / data-mode / data-motion / data-density / data-fontsize */
export const THEME_NO_FLASH_SCRIPT = `
(function(){
  try{
    var get = function(k, d){ try { return localStorage.getItem(k) || d; } catch(e){ return d; } };
    var t = get('${THEME_LS_KEY}', '${DEFAULT_THEME}');
    var m = get('${MODE_LS_KEY}', '${DEFAULT_MODE}');
    if (m === 'system') {
      m = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var root = document.documentElement;
    root.setAttribute('data-theme', t);
    root.setAttribute('data-mode', m);
    var motion = get('${MOTION_LS_KEY}', 'on');
    if (motion === 'off') root.setAttribute('data-motion', 'off');
    var density = get('${DENSITY_LS_KEY}', 'comfortable');
    if (density === 'compact') root.setAttribute('data-density', 'compact');
    var fs = get('${FONTSIZE_LS_KEY}', 'medium');
    if (fs === 'large') root.setAttribute('data-fontsize', 'large');
  }catch(e){}
})();
`;

/** 解析 system 模式下的实际明暗（客户端） */
export function resolveMode(mode: ColorMode): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
