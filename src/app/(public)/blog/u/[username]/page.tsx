import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPostService } from "@/modules/blog/services/post.service";
import { prisma } from "@/lib/db";
import { AuthorCard } from "@/modules/blog/components/author-card";
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
 * 同样不读 Session：作者本人看到的是"公开视图 + 客户端补出来的『我的文章』入口"，
 * 服务端输出与访客完全一致（见 blog-public-shell.tsx 的说明）。
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
    title: `${name} 的文章`,
    description: truncate(`${name} 在个人数字工作台发布的文章列表。`, 160),
    alternates: {
      canonical: `${env.APP_URL}/blog/u/${user.username}`,
      // 作者级 RSS 自动发现（PRD §5.8）
      types: { "application/rss+xml": `${env.APP_URL}/blog/u/${user.username}/rss.xml` },
    },
    openGraph: { type: "profile", title: `${name} 的文章` },
  };
}

export default async function AuthorPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  });
  if (!user) notFound();

  const { items, nextCursor, stats } = await postService.listByAuthor(username, { take: TAKE });

  return (
    <div className="space-y-6">
      <AuthorCard author={user} stats={stats} />

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

      {/* 结构化数据（PRD §5.9）：作者页用 Person；bio 字段本期无数据来源（见 AuthorCard 注），留待扩展 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(
            buildPersonJsonLd(
              { username: user.username, displayName: user.displayName, bio: null },
              env.APP_URL,
            ),
          ),
        }}
      />
    </div>
  );
}
