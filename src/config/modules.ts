import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ListChecks,
  Flame,
  FileText,
  Link2,
  Bookmark,
  ClipboardList,
  Download,
  FileCog,
  Sparkles,
} from "lucide-react";

/**
 * 模块注册表 —— 新增板块的唯一入口。
 * 侧边栏、占位页、快捷入口全部由它驱动。
 * 新增一个板块 = 改这一个文件 + 新增一个模块目录（假设 H1 的验证点）。
 */
export type ModuleStatus = "ready" | "planned" | "integrating" | "coming-soon";

export type ModuleMeta = {
  key: string;
  name: string;
  path: string;
  icon: LucideIcon;
  status: ModuleStatus;
  order: number;
  group: "core" | "content" | "tools";
  description: string;
  requiresAuth: boolean;
};

export const MODULES: ModuleMeta[] = [
  {
    key: "dashboard",
    name: "总览",
    path: "/dashboard",
    icon: LayoutDashboard,
    status: "ready",
    order: 1,
    group: "core",
    description: "今日待办、习惯状态与平台快捷入口",
    requiresAuth: true,
  },
  {
    key: "tasks",
    name: "任务清单",
    path: "/tasks",
    icon: ListChecks,
    status: "ready",
    order: 2,
    group: "core",
    description: "任务管理：搜索、过滤、优先级、标签与截止日期",
    requiresAuth: true,
  },
  {
    key: "habits",
    name: "习惯打卡",
    path: "/habits",
    icon: Flame,
    status: "ready",
    order: 3,
    group: "core",
    description: "建立习惯、每日打卡、连续天数与热力图",
    requiresAuth: true,
  },
  {
    key: "blog",
    name: "博客",
    path: "/blog",
    icon: FileText,
    status: "planned",
    order: 4,
    group: "content",
    description: "Markdown 编辑、草稿、标签、评论与全文搜索",
    requiresAuth: true,
  },
  {
    key: "links",
    name: "短链",
    path: "/links",
    icon: Link2,
    status: "planned",
    order: 5,
    group: "content",
    description: "短链生成、自定义别名、二维码与点击统计",
    requiresAuth: true,
  },
  {
    key: "bookmarks",
    name: "书签",
    path: "/bookmarks",
    icon: Bookmark,
    status: "planned",
    order: 6,
    group: "content",
    description: "链接收藏、标签整理、全文搜索与导入导出",
    requiresAuth: true,
  },
  {
    key: "surveys",
    name: "问卷",
    path: "/surveys",
    icon: ClipboardList,
    status: "planned",
    order: 7,
    group: "content",
    description: "创建问卷、多题型、逻辑跳转与结果导出",
    requiresAuth: true,
  },
  {
    key: "downloader",
    name: "视频下载",
    path: "/downloader",
    icon: Download,
    status: "integrating",
    order: 8,
    group: "tools",
    description: "视频解析与下载（bilidown / CCTVdown 服务化接入）",
    requiresAuth: true,
  },
  {
    key: "converter",
    name: "文档转换",
    path: "/converter",
    icon: FileCog,
    status: "integrating",
    order: 9,
    group: "tools",
    description: "Word / PDF 互转与在线增强预览",
    requiresAuth: true,
  },
];

export const COMING_SOON_MODULE: ModuleMeta = {
  key: "coming-soon",
  name: "敬请期待",
  path: "/soon",
  icon: Sparkles,
  status: "coming-soon",
  order: 10,
  group: "core",
  description: "平台的扩展位：更多工具正在路上",
  requiresAuth: true,
};

export function getModuleByPath(pathname: string): ModuleMeta | undefined {
  return MODULES.find((m) => pathname.startsWith(m.path));
}

/** 侧边栏分组顺序 */
export const MODULE_GROUP_LABELS: Record<ModuleMeta["group"], string> = {
  core: "工作台",
  content: "内容",
  tools: "工具",
};
