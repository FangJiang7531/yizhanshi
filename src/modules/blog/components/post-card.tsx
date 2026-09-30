import Link from "next/link";
import { Eye, Heart, MessageSquare, Clock } from "lucide-react";
import { formatCount, formatDate, formatReadingTime, isoDateOnly } from "../lib/format";
import { TagRow } from "./tag-chip";
import type { PostListItemDTO } from "../types";

/** 作者头像：有图用图，否则首字章（与平台顶栏同一套视觉规则） */
export function AuthorAvatar({
  author,
  size = 24,
}: {
  author: { displayName: string | null; username: string; avatarUrl: string | null };
  size?: number;
}) {
  return (
    <Link
      href={`/blog/u/${author.username}`}
      className="flex shrink-0 items-center gap-1.5 transition-opacity hover:opacity-80"
    >
      {author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- 头像走本地 API 路由，next/image 需额外域名配置
        <img
          src={author.avatarUrl}
          alt=""
          width={size}
          height={size}
          className="shrink-0 rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          aria-hidden
          className="flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
          style={{
            width: size,
            height: size,
            background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
            color: "var(--color-primary-fg)",
          }}
        >
          {(author.displayName ?? author.username).slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="truncate text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
        {author.displayName ?? author.username}
      </span>
    </Link>
  );
}

/** 文章统计小项（图标 + 数字；数字为 0 时由调用方决定是否隐藏） */
function StatItem({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={label} aria-label={`${label} ${value}`}>
      <span aria-hidden style={{ color: "var(--color-text-muted)" }}>
        {icon}
      </span>
      {formatCount(value)}
    </span>
  );
}

/**
 * 文章卡片（PRD §8.2：**无边框、无阴影**，仅靠留白与细分隔线区分）。
 *
 * 同时被服务端（首屏）与客户端（"加载更多"追加）渲染，因此本组件只用
 * 纯函数与 next/link，不触碰任何服务端专有 API。
 */
export function PostCard({ post }: { post: PostListItemDTO }) {
  return (
    <article className="group flex gap-4 py-6 sm:gap-6">
      <div className="min-w-0 flex-1">
        <h2 className="text-[19px] font-semibold leading-snug tracking-tight sm:text-[21px]">
          <Link
            href={`/blog/p/${post.slug}`}
            className="transition-colors group-hover:text-[var(--color-primary)]"
          >
            {post.title || "无标题"}
          </Link>
        </h2>

        {post.excerpt && (
          <p
            className="mt-2 line-clamp-2 text-sm leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {post.excerpt}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px]">
          <AuthorAvatar author={post.author} />
          <span style={{ color: "var(--color-text-muted)" }}>·</span>
          <time
            dateTime={isoDateOnly(post.publishedAt)}
            style={{ color: "var(--color-text-muted)" }}
          >
            {formatDate(post.publishedAt)}
          </time>
          <span className="inline-flex items-center gap-1" style={{ color: "var(--color-text-muted)" }}>
            <Clock size={12} aria-hidden />
            {formatReadingTime(post.readingMinutes)}
          </span>
          <span className="ml-auto flex items-center gap-3" style={{ color: "var(--color-text-muted)" }}>
            <StatItem icon={<Eye size={13} />} value={post.viewCount} label="浏览" />
            <StatItem icon={<Heart size={13} />} value={post.likeCount} label="点赞" />
            <StatItem icon={<MessageSquare size={13} />} value={post.commentCount} label="评论" />
          </span>
        </div>

        {post.tags.length > 0 && (
          <div className="mt-3">
            <TagRow tags={post.tags} />
          </div>
        )}
      </div>

      {post.coverImage && (
        <Link
          href={`/blog/p/${post.slug}`}
          className="hidden shrink-0 overflow-hidden rounded-[var(--radius)] sm:block"
          style={{ width: 168, aspectRatio: "16 / 10" }}
          tabIndex={-1}
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 上传图走本地 API 路由且已转 WebP */}
          <img
            src={post.coverImage}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </Link>
      )}
    </article>
  );
}

/** 文章列表：卡片之间只用一条细分隔线（无卡片边框，见 PRD §8.2） */
export function PostList({ items }: { items: PostListItemDTO[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      {items.map((post, i) => (
        <div key={post.id}>
          {i > 0 && (
            <div
              aria-hidden
              className="h-px"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-border) 70%, transparent)" }}
            />
          )}
          <PostCard post={post} />
        </div>
      ))}
    </div>
  );
}
