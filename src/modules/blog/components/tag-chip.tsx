import Link from "next/link";
import type { TagRefDTO } from "../types";

/**
 * 标签胶囊（PRD §8.2：主色仅用于链接、标签、进度条）。
 *
 * 颜色策略：标签色只作为**小圆点**出现，文字与描边一律走语义变量。
 * 原因：标签色是用户在数据里自选的值，直接把它当文字色会在某些主题
 * （如 pure-black 深色底）上产生对比度不足的不可读组合；作为 6px 圆点
 * 则无论什么主题都只是点缀，不影响可读性。圆点是纯装饰，故 aria-hidden。
 */
export function TagChip({
  tag,
  size = "sm",
}: {
  tag: TagRefDTO;
  size?: "sm" | "md";
}) {
  return (
    <Link
      href={`/blog/tags/${encodeURIComponent(tag.name)}`}
      className="chip transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
      style={size === "md" ? { fontSize: 13, padding: "5px 12px" } : undefined}
    >
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-full"
        style={{ width: 6, height: 6, backgroundColor: tag.color }}
      />
      {tag.name}
    </Link>
  );
}

/** 标签行：多个标签的横向排列容器 */
export function TagRow({ tags }: { tags: TagRefDTO[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <TagChip key={t.id} tag={t} />
      ))}
    </div>
  );
}
