import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createPostService } from "@/modules/blog/services/post.service";
import { createFollowService } from "@/modules/notification/services/follow.service";
import { SpaceHeader } from "@/modules/blog/components/space/space-header";
import { MyPosts } from "@/modules/blog/components/manage/my-posts";

export const dynamic = "force-dynamic";

export const metadata = { title: "我的空间 · 个人数字工作台" };

/**
 * 我的空间（原「我的文章」升级版）：
 * 封面 + 圆形头像 + 昵称/简介 + 关注·粉丝·动态 + 文章/动态板块。
 * 他人空间见 /blog/u/[username]（公开侧同构样式）。
 */
export default async function SpacePage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");
  if ("guest" in principal) redirect("/login");
  const user = principal.user;

  const service = createPostService();
  const followService = createFollowService();
  const [mine, social, badgeRow] = await Promise.all([
    service.listMine(user.id, { status: "DRAFT", sort: "updated", take: 20 }),
    followService.statsOf(user.username),
    prisma.userBadge.findUnique({ where: { userId: user.id } }),
  ]);
  const badge =
    badgeRow?.enabled
      ? { text: badgeRow.text, color: badgeRow.color, bgColor: badgeRow.bgColor }
      : null;

  return (
    <div className="space-y-5">
      <SpaceHeader
        username={user.username}
        displayName={user.displayName ?? user.username}
        bio={user.bio}
        avatarUrl={user.avatarUrl}
        coverImage={user.coverImage}
        stats={social}
        isMe
        badge={badge}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
          创作管理
        </h2>
        <div className="flex items-center gap-2">
          {user.role === "ADMIN" && (
            <Link href="/blog/moderation" className="btn btn-outline gap-1.5 text-sm">
              <ShieldCheck size={15} aria-hidden />
              审核队列
            </Link>
          )}
          <Link href="/blog/new" className="btn btn-primary gap-1.5 text-sm">
            <Plus size={15} aria-hidden />
            写文章
          </Link>
        </div>
      </div>

      <MyPosts initialItems={mine.items} initialCursor={mine.nextCursor} initialTab="DRAFT" />
    </div>
  );
}
