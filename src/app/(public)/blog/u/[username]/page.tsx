import type { Metadata } from "next";
import type { ComponentProps } from "react";
import { notFound } from "next/navigation";
import { createPostService } from "@/modules/blog/services/post.service";
import { createFollowService } from "@/modules/notification/services/follow.service";
import { prisma } from "@/lib/db";
import { SpaceHeader } from "@/modules/blog/components/space/space-header";
import { PostList } from "@/modules/blog/components/post-card";
import { LoadMorePosts } from "@/modules/blog/components/load-more-posts";
import { EmptyState } from "@/components/feedback/empty-state";
import { truncate } from "@/modules/blog/lib/format";
import { buildPersonJsonLd, safeJsonLd } from "@/modules/blog/lib/seo";
import { env } from "@/config/env";

/**
 * 作者主页 `/blog/u/[username]`（PRD §3.1：SSG + ISR 1800s）。
 *
 * Gate 5.4 判据 1：**仅展示该作者的 PUBLIC 已发布文章**。
 * 这一点由仓储层的 `PUBLIC_LISTABLE`（status/auditStatus/visibility/deletedAt 四条件）
 * 保证，页面本身不做二次过滤 —— 过滤散落在页面里就会有人漏写。
 *
 * 2026-10：页头升级为「空间」样式（封面 + 头像 + 关注/粉丝/动态），
 * 与登录用户的 /space 同构；头像弹出菜单提供 资料/关注/私聊/举报。
 */
export const revalidate = 1800;
export const dynamicParams = true;

const TAKE = 10;
const postService = createPostService();

export async function generateStaticParams() {
  const authors = await postService.listAuthorStaticParams();
  return authors.map((a) => ({ username: a.username }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username },
    select: { username: true, displayName: true },
  });
  if (!user) return { title: "作者不存在", robots: { index: false, follow: false } };

  const name = user.displayName ?? user.username;
  return {
    title: `${name} 的空间`,
    description: truncate(`${name} 在个人数字工作台发布的文章列表。`, 160),
    alternates: {
      canonical: `${env.APP_URL}/blog/u/${user.username}`,
      // 作者级 RSS 自动发现（PRD §5.8）
      types: { "application/rss+xml": `${env.APP_URL}/blog/u/${user.username}/rss.xml` },
    },
    openGraph: { type: "profile", title: `${name} 的空间` },
  };
}

export default async function AuthorPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      coverImage: true,
    },
  });
  if (!user) notFound();

  const [authorData, social] = await Promise.all([
    postService.listByAuthor(username, { take: TAKE }),
    createFollowService().statsOf(username),
  ]);
  const { items, nextCursor } = authorData;

  return (
    <div className="space-y-6">
      {/* 空间头部：封面 + 头像 + 关注/粉丝/动态（isMe=false 时全部编辑入口隐藏） */}
      <SpaceHeader
        {...({
          username: user.username,
          displayName: user.displayName ?? user.username,
          bio: user.bio,
          avatarUrl: user.avatarUrl,
          coverImage: user.coverImage,
          stats: social,
          isMe: false,
        } as ComponentProps<typeof SpaceHeader>)}
      />

      {items.length === 0 ? (
        <EmptyState
          kind="generic"
          title="这位作者还没有公开文章"
          description="已发布且公开的文章会出现在这里。"
        />
      ) : (
        <>
          <PostList items={items} />
          <LoadMorePosts scope="author" username={username} initialCursor={nextCursor} />
        </>
      )}

      {/* 结构化数据（PRD §5.9）：作者页用 Person */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(
            buildPersonJsonLd(
              { username: user.username, displayName: user.displayName, bio: user.bio },
              env.APP_URL,
            ),
          ),
        }}
      />
    </div>
  );
}
