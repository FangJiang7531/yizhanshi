import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { THEME_NO_FLASH_SCRIPT } from "@/lib/theme/tokens";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "个人数字工作台",
  description: "一站式个人数字工作台：任务清单、习惯打卡与更多工具",
};

/**
 * 根布局。
 * 关键点（PRD §7.7 首屏防闪烁）：THEME_NO_FLASH_SCRIPT 必须是 head 中最早执行的
 * 阻塞式内联脚本，在首屏渲染前就把 data-theme / data-mode 写到 <html>，
 * 否则服务端返回后再切换会造成闪白。
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_NO_FLASH_SCRIPT }} />
      </head>
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
