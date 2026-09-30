import { NextResponse } from "next/server";
import { createPostService } from "@/modules/blog/services/post.service";
import { buildRssXml } from "@/modules/blog/lib/rss";
import { SITE_NAME } from "@/modules/blog/lib/seo";
import { env } from "@/config/env";

/**
 * 全站 RSS `/blog/rss.xml`（PRD §5.8：最新 20 篇，RSS 2.0 + Atom 自链接）。
 *
 * 排除项由仓储 PUBLIC_LISTABLE 保证（PRIVATE/UNLISTED/草稿/待审/驳回/已删
 * 一律不进 feed）——路由层不重复过滤，过滤散落就会有人漏写。
 *
 * 缓存三层：`revalidate = 1800`（Next 全路由缓存）+ Cache-Control 头
 * （下游 CDN/浏览器）+ 发布时 revalidatePath 主动失效（post.actions 已接线，
 * PRD A-08「发布后 1 秒内出现在 RSS」由此保证）。
 */
export const revalidate = 1800;

export async function GET() {
  const { items } = await createPostService().listPublic({ tab: "latest", take: 20 });

  const xml = buildRssXml(items, {
    title: `${SITE_NAME} · 博客`,
    description: "最新发布的公开文章（任务复盘、习惯打卡与生活记录）。",
    siteUrl: env.APP_URL,
    feedUrl: `${env.APP_URL}/blog/rss.xml`,
    siteName: SITE_NAME,
  });

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800, s-maxage=1800",
    },
  });
}
