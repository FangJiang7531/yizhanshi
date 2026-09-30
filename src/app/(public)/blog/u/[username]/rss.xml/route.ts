import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createPostService } from "@/modules/blog/services/post.service";
import { buildRssXml } from "@/modules/blog/lib/rss";
import { SITE_NAME } from "@/modules/blog/lib/seo";
import { env } from "@/config/env";

/**
 * 作者 RSS `/blog/u/[username]/rss.xml`（PRD §5.8：该作者最新 20 篇）。
 *
 * 作者不存在 → 404（不泄漏"存在但无公开文章"与"不存在"的区别在此无所谓：
 * feed 是聚合位，作者不存在时给 404 是阅读器的正确处理路径）。
 * 作者存在但没有公开文章 → 合法空 feed（订阅先于创作，合法用例）。
 */
export const revalidate = 1800;

export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username },
    select: { username: true, displayName: true },
  });
  if (!user) return new NextResponse(null, { status: 404 });

  const name = user.displayName ?? user.username;
  const { items } = await createPostService().listByAuthor(username, { take: 20 });

  const xml = buildRssXml(items, {
    title: `${name} 的文章`,
    description: `${name} 在${SITE_NAME}发布的最新公开文章。`,
    siteUrl: env.APP_URL,
    feedUrl: `${env.APP_URL}/blog/u/${encodeURIComponent(username)}/rss.xml`,
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
