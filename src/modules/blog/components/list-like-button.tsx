"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import { toggleLikeAction } from "../actions/interaction.actions";

/**
 * 列表页内联点赞按钮：点一次 +1（乐观更新），未登录/失败回退并引导登录。
 * 独立 client 组件，保证 PostCard 仍可被服务端直接渲染。
 */
export function ListLikeButton({
  postId,
  likeCount,
  slug,
}: {
  postId: string;
  likeCount: number;
  slug: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [count, setCount] = useState(likeCount);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((c) => c + (nextLiked ? 1 : -1));
    const res = await toggleLikeAction({ postId });
    setBusy(false);
    if (!res.success) {
      setLiked(!nextLiked);
      setCount((c) => c + (nextLiked ? -1 : 1));
      if (res.error.code === "UNAUTHORIZED" || res.error.code === "FORBIDDEN") {
        toast("info", "登录后即可点赞");
        router.push(`/login?next=/blog/p/${slug}`);
      } else {
        toast("error", res.error.message);
      }
      return;
    }
    setLiked(res.data.liked);
    setCount(res.data.likeCount);
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle();
      }}
      className="inline-flex items-center gap-1 transition-colors hover:text-[var(--color-primary)]"
      style={{ color: liked ? "var(--color-primary)" : undefined }}
      aria-pressed={liked}
      aria-label={liked ? "取消点赞" : "点赞"}
      title={liked ? "已点赞" : "点赞"}
    >
      <Heart size={13} fill={liked ? "currentColor" : "none"} aria-hidden />
      <span className="tabular-nums">{count > 0 ? count : ""}</span>
    </button>
  );
}
