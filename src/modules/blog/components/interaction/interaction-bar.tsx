"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Heart, Link2, MessageSquare, Repeat2, Share2 } from "lucide-react";
import {
  getMyReactionsAction,
  recordViewAction,
  shareAction,
  toggleLikeAction,
} from "../../actions/interaction.actions";
import { getInteractionCapabilityAction } from "../../actions/comment.actions";
import { getViewerIdentityAction } from "../../actions/post.actions";
import { RepostDialog } from "./repost-dialog";
import { useToast } from "@/components/feedback/toast";

/**
 * 详情页互动栏（PRD §5.5）：点赞 / 转发 / 分享 / 评论锚点 / 浏览计数。
 *
 * 挂载时序与身份规则（Gate 5.2 缓存隔离的延续）：
 * - 服务端传入的计数是 ISR 快照，作为基线；本组件挂载后客户端查询登录态
 *   （getViewerIdentity / getMyReactions / getInteractionCapability），
 *   不把任何身份内容渲染进服务端输出；
 * - 点赞/转发走 toggle + 乐观更新，失败回退 + Toast（PRD §5.5）；
 * - 浏览记录 fire-and-forget：recordViewAction 内部按身份/UA 去重，失败静默；
 * - 访客模式：按钮可见但禁用，reason 作为原生提示（注册引导）。
 */

export type PostCounters = {
  likeCount: number;
  commentCount: number;
  repostCount: number;
  shareCount: number;
  viewCount: number;
};

/** 200ms 数字滚动（PRD §5.5）；prefers-reduced-motion 下直接跳变 */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;
    if (from === value) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const duration = 200;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className="tabular-nums">{shown}</span>;
}

export function InteractionBar({
  postId,
  slug,
  title,
  counters,
}: {
  postId: string;
  slug: string;
  title: string;
  counters: PostCounters;
}) {
  const toast = useToast();
  const [c, setC] = useState(counters);
  const [liked, setLiked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [canInteract, setCanInteract] = useState(true);
  const [disableReason, setDisableReason] = useState<string | null>(null);
  const [pop, setPop] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const viewRecordedRef = useRef(false);

  // 挂载：身份查询 + 浏览计数（一次性）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [identity, capability] = await Promise.all([
        getViewerIdentityAction(),
        getInteractionCapabilityAction(),
      ]);
      if (cancelled) return;
      const loggedIn = identity.success && identity.data.userId !== null;
      setCanInteract(capability.success ? capability.data.canInteract : false);
      if (capability.success && capability.data.reason) setDisableReason(capability.data.reason);
      if (loggedIn) {
        const mine = await getMyReactionsAction({ postId });
        if (!cancelled && mine.success) {
          setLiked(mine.data.liked);
          setReposted(mine.data.reposted);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  useEffect(() => {
    if (viewRecordedRef.current) return;
    viewRecordedRef.current = true;
    void recordViewAction({ postId }).then((res) => {
      // counted=true 说明本次被计入（首日首次），前端计数同步 +1 与服务端口径对齐
      if (res.success && res.data.counted) setC((p) => ({ ...p, viewCount: p.viewCount + 1 }));
    });
  }, [postId]);

  async function onLike() {
    if (busy) return;
    const nextLiked = !liked;
    // 乐观更新：图标立即填充 + 计数 ±1（PRD §5.5）
    setLiked(nextLiked);
    setC((p) => ({ ...p, likeCount: p.likeCount + (nextLiked ? 1 : -1) }));
    if (nextLiked) {
      setPop(true);
      setTimeout(() => setPop(false), 320);
    }
    setBusy(true);
    const res = await toggleLikeAction({ postId });
    setBusy(false);
    if (!res.success) {
      // 失败回退
      setLiked(!nextLiked);
      setC((p) => ({ ...p, likeCount: p.likeCount + (nextLiked ? -1 : 1) }));
      toast.error(res.error.message || "操作失败，请重试");
      return;
    }
    // 以服务端结果为准校正
    setLiked(res.data.liked);
    setC((p) => ({ ...p, likeCount: res.data.likeCount }));
  }

  function onReposted(res: { reposted: boolean; repostCount: number }) {
    setReposted(res.reposted);
    setC((p) => ({ ...p, repostCount: res.repostCount }));
  }

  async function onShare() {
    const url = `${window.location.origin}/blog/p/${slug}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("链接已复制到剪贴板");
      }
      // 站外分享计数：仅登录用户（访客调 shareAction 会被拒，静默跳过）
      const res = await shareAction({ postId });
      if (res.success) setC((p) => ({ ...p, shareCount: res.data.shareCount }));
    } catch {
      // 用户取消 share 面板不视为错误
    }
  }

  function scrollToComments() {
    document.getElementById("comments")?.scrollIntoView({ behavior: "smooth" });
  }

  const disabledProps = (interactive: boolean) =>
    interactive && canInteract ? {} : { disabled: true, title: disableReason ?? "登录后可互动" };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="interaction-bar">
      <button
        type="button"
        className={`interaction-btn ${pop ? "interaction-pop" : ""}`}
        data-active={liked}
        onClick={() => void onLike()}
        aria-pressed={liked}
        aria-label={liked ? "取消点赞" : "点赞"}
        {...disabledProps(true)}
      >
        <Heart size={15} fill={liked ? "currentColor" : "none"} aria-hidden />
        <CountUp value={c.likeCount} />
      </button>

      <button
        type="button"
        className="interaction-btn"
        data-active={reposted}
        onClick={() => (reposted ? setRepostOpen(true) : setRepostOpen(true))}
        aria-haspopup="dialog"
        aria-label="转发"
        {...disabledProps(true)}
      >
        <Repeat2 size={15} aria-hidden />
        <CountUp value={c.repostCount} />
      </button>

      <button type="button" className="interaction-btn" onClick={scrollToComments} aria-label="跳到评论区">
        <MessageSquare size={15} aria-hidden />
        <CountUp value={c.commentCount} />
      </button>

      <button type="button" className="interaction-btn" onClick={() => void onShare()} aria-label="分享到站外">
        <Share2 size={15} aria-hidden />
        <span className="tabular-nums">{c.shareCount}</span>
        <Link2 size={12} aria-hidden className="opacity-60" />
      </button>

      <span className="ml-auto flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
        <Eye size={13} aria-hidden />
        <span className="tabular-nums">{c.viewCount.toLocaleString("zh-CN")}</span>
        次阅读
      </span>

      <RepostDialog
        open={repostOpen}
        postId={postId}
        reposted={reposted}
        onClose={() => setRepostOpen(false)}
        onDone={onReposted}
      />
    </div>
  );
}
