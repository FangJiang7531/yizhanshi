import Link from "next/link";
import { Rss } from "lucide-react";
import { formatCount } from "../lib/format";
import type { AuthorDTO } from "../types";

/**
 * 作者信息卡（PRD §5.4 / Gate 5.4）。
 *
 * 关于"简介"：PRD §5.4 的作者卡列出了简介，但 §4.1 的数据模型变更清单中
 * User 只新增了反向关系、**没有 `bio` 字段**——即简介在本期没有数据来源。
 * 以数据模型清单为准（PRD 内部冲突时以可落地的模型定义为准），作者卡暂不展示简介；
 * 若后续要加，应作为独立需求扩展 User 模型并同步资料页编辑入口。
 */
export function AuthorCard({
  author,
  stats,
  isOwner,
}: {
  author: AuthorDTO;
  stats: { postCount: number; totalViews: number; totalLikes: number };
  isOwner?: boolean;
}) {
  const name = author.displayName ?? author.username;
  return (
    <section
      className="flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] border p-5"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-surface)" }}
      aria-label="作者信息"
    >
      {author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- 头像走本地 API 路由，next/image 需额外域名配置
        <img
          src={author.avatarUrl}
          alt=""
          width={56}
          height={56}
          className="shrink-0 rounded-full object-cover"
          style={{ width: 56, height: 56 }}
        />
      ) : (
        <span
          aria-hidden
          className="flex shrink-0 items-center justify-center rounded-full text-xl font-bold"
          style={{
            width: 56,
            height: 56,
            background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
            color: "var(--color-primary-fg)",
          }}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-lg font-semibold">{name}</h1>
          {isOwner && (
            <Link href="/blog/me" className="chip" style={{ fontSize: 11, padding: "2px 8px" }}>
              我的文章
            </Link>
          )}
        </div>
        <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-muted)" }}>
          @{author.username}
        </p>
        <dl className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
          <Stat label="文章" value={String(stats.postCount)} />
          <Stat label="总阅读" value={formatCount(stats.totalViews)} />
          <Stat label="总获赞" value={formatCount(stats.totalLikes)} />
        </dl>
      </div>

      <a
        href={`/blog/u/${author.username}/rss.xml`}
        className="btn btn-outline btn-sm shrink-0"
        title="订阅该作者的 RSS"
      >
        <Rss size={14} aria-hidden />
        订阅
      </a>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dd className="font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
        {value}
      </dd>
      <dt style={{ color: "var(--color-text-muted)" }}>{label}</dt>
    </div>
  );
}
