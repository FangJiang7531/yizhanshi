"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Download, MessageCircle, Pencil, UserCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/feedback/toast";
import { BadgeChip, WithSStrip } from "@/components/ui/user-badge";
import {
  uploadCoverAction,
  removeCoverAction,
  updateProfileAction,
} from "@/modules/auth/actions/profile-actions";
import {
  isFollowingAction,
  listFollowersAction,
  listFollowingAction,
  toggleFollowAction,
} from "@/modules/notification/actions/follow.actions";
import { UserAvatarMenu } from "@/modules/notification/components/user-avatar-menu";

type FollowUser = { username: string; displayName: string | null; avatarUrl: string | null };

/**
 * 空间头部（客户端）：封面（挂图/上传）+ 圆形头像 + 昵称/简介/资料设置 + 关注·粉丝·动态。
 * - 关注/私聊按钮直接置于头部（他人空间）；自己的空间点击关注/粉丝数可查看列表；
 * - 头像弹出菜单不被裁剪：容器不用 overflow-hidden，封面圆角由内部元素承担；
 * - 简介与右侧统计分行排布，杜绝窄屏重叠；
 * - 手机端「下拉到顶放大封面并丝滑回弹」（全局 touch 监听，reduced-motion 降级）。
 */
export function SpaceHeader({
  username,
  displayName,
  bio,
  avatarUrl,
  coverImage,
  stats,
  isMe,
  badge,
}: {
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  coverImage: string | null;
  stats: { following: number; followers: number; posts: number };
  isMe: boolean;
  badge?: { text: string; color: string; bgColor: string | null } | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cover, setCover] = useState(coverImage);
  const [pull, setPull] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const [bioDraft, setBioDraft] = useState(bio ?? "");
  const [editingBio, setEditingBio] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [editingName, setEditingName] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followList, setFollowList] = useState<{ kind: "following" | "followers"; items: FollowUser[] } | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [coverViewOpen, setCoverViewOpen] = useState(false);

  // 他人空间：挂载时查询关注态
  useEffect(() => {
    if (isMe) return;
    void (async () => {
      const res = await isFollowingAction({ username });
      if (res.success) setFollowing(res.data.following);
    })();
  }, [isMe, username]);

  // 手机端下拉放大 + 回弹（仅触屏；reduced-motion 用户跳过）
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    function onTouchStart(e: TouchEvent) {
      touchStartY.current = e.touches[0]?.clientY ?? null;
    }
    function onTouchMove(e: TouchEvent) {
      if (touchStartY.current === null) return;
      if (window.scrollY > 0) {
        touchStartY.current = e.touches[0]?.clientY ?? null;
        setPull(0);
        return;
      }
      const y = e.touches[0]?.clientY ?? 0;
      const delta = y - touchStartY.current;
      if (delta > 0) setPull(Math.min(60, delta * 0.5));
    }
    function onTouchEnd() {
      touchStartY.current = null;
      setPull(0); // 松手回弹（transition 在 style 中）
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  async function handleCoverUpload(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadCoverAction(fd);
    if (res.success) {
      setCover(res.data.coverUrl);
      toast("success", "封面已更新");
      router.refresh();
    } else {
      toast("error", res.error.message);
    }
  }

  async function saveBio() {
    const res = await updateProfileAction({ displayName: nameDraft, bio: bioDraft });
    if (res.success) {
      toast("success", "简介已保存");
      setEditingBio(false);
      router.refresh();
    } else {
      toast("error", res.error.message);
    }
  }

  async function saveName() {
    if (!nameDraft.trim()) return;
    const res = await updateProfileAction({ displayName: nameDraft.trim(), bio: bioDraft });
    if (res.success) {
      toast("success", "昵称已保存");
      setEditingName(false);
      router.refresh();
    } else {
      toast("error", res.error.message);
    }
  }

  async function handleFollow() {
    if (followBusy) return;
    setFollowBusy(true);
    const res = await toggleFollowAction({ username });
    setFollowBusy(false);
    if (res.success) {
      setFollowing(res.data.following);
      toast("success", res.data.following ? `已关注 ${displayName}` : `已取消关注`);
      // 刷新使对方粉丝数 / 我的关注数立即生效
      router.refresh();
    } else {
      toast("error", res.error.message);
    }
  }

  async function openFollowList(kind: "following" | "followers") {
    // 自己的空间才可查看列表（他人空间点数字无动作）
    if (!isMe) return;
    setListLoading(true);
    setFollowList({ kind, items: [] });
    const res = kind === "following" ? await listFollowingAction({ username }) : await listFollowersAction({ username });
    setListLoading(false);
    if (res.success) {
      setFollowList({ kind, items: res.data.items });
    } else {
      toast("error", res.error.message);
      setFollowList(null);
    }
  }

  const name = displayName;

  return (
    <header className="relative rounded-[var(--radius-lg)]" style={{ backgroundColor: "var(--color-bg-surface)", border: "1px solid color-mix(in srgb, var(--color-border) 30%, transparent)" }}>
      {/* 封面：有图挂图，无图用主题渐变；点击查看大图并下载；下拉时放大（手机端 overscroll 弹性） */}
      <div
        className="relative h-40 cursor-zoom-in rounded-t-[var(--radius-lg)] sm:h-52"
        title={cover ? "查看封面大图" : undefined}
        onClick={() => cover && setCoverViewOpen(true)}
        style={{
          background: cover
            ? `url(${cover}) center/cover`
            : "linear-gradient(120deg, color-mix(in srgb, var(--color-primary) 24%, var(--color-bg-surface)), color-mix(in srgb, var(--color-accent) 18%, var(--color-bg-surface)))",
          transform: pull > 0 ? `scale(${1 + pull / 400})` : undefined,
          transition: pull > 0 ? "none" : "transform 450ms var(--ease-spring)",
        }}
      >
        {isMe && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCoverUpload(f);
                e.target.value = "";
              }}
            />
            <div className="absolute bottom-3 right-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="glass-panel flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                onClick={() => fileRef.current?.click()}
              >
                <Camera size={13} aria-hidden />
                {cover ? "更换封面" : "添加封面"}
              </button>
              {cover && (
                <button
                  type="button"
                  className="glass-panel flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                  onClick={async () => {
                    const res = await removeCoverAction();
                    if (res.success) {
                      setCover(null);
                      toast("success", "封面已移除");
                    }
                  }}
                >
                  移除
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* 信息区：头像叠在封面下缘；简介行与统计行分离，杜绝重叠 */}
      <div className="relative px-5 pb-4">
        <div className="flex items-end justify-between gap-3">
          <div className="-mt-8 shrink-0 sm:-mt-10">
            <UserAvatarMenu username={username} displayName={name} avatarUrl={avatarUrl} isMe={isMe}>
              <WithSStrip badge={badge}>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 头像走本地 API
                  <img
                    src={avatarUrl}
                    alt=""
                    width={72}
                    height={72}
                    className="rounded-full border-4 object-cover"
                    style={{ width: 72, height: 72, borderColor: "var(--color-bg-surface)" }}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex items-center justify-center rounded-full border-4 text-2xl font-bold"
                    style={{
                      width: 72,
                      height: 72,
                      borderColor: "var(--color-bg-surface)",
                      background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
                      color: "var(--color-primary-fg)",
                    }}
                  >
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </WithSStrip>
            </UserAvatarMenu>
          </div>

          {/* 关注/粉丝/动态：窄屏独占一行（w-full），不与简介挤压重叠 */}
          <dl className="flex shrink-0 items-center gap-5 pt-3 text-sm sm:pt-4">
            <Stat
              label="关注"
              value={stats.following}
              onClick={isMe ? () => void openFollowList("following") : undefined}
            />
            <Stat
              label="粉丝"
              value={stats.followers}
              onClick={isMe ? () => void openFollowList("followers") : undefined}
            />
            <Stat label="动态" value={stats.posts} />
          </dl>
        </div>

        {/* 第二行：昵称 + 操作按钮 */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {editingName ? (
            <span className="flex flex-wrap items-center gap-2">
              <input
                className="input max-w-[220px] py-1 text-base"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={30}
                aria-label="昵称"
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveName()}>
                保存
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingName(false)}>
                取消
              </button>
            </span>
          ) : (
            <h1 className="flex min-w-0 max-w-full items-center gap-1.5 truncate text-lg font-semibold">
              <span className="truncate">{name}</span>
              <BadgeChip badge={badge} fontSize={12} />
            </h1>
          )}
          {!editingName && (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              @{username}
            </span>
          )}
          {isMe && !editingName && (
            <button
              type="button"
              className="icon-btn !h-7 !w-7"
              aria-label="编辑昵称"
              title="编辑昵称"
              onClick={() => setEditingName(true)}
            >
              <Pencil size={13} />
            </button>
          )}
          {!isMe && (
            <span className="ml-auto flex shrink-0 items-center gap-2">
              <button
                type="button"
                className={`btn btn-sm ${following ? "btn-outline" : "btn-primary"}`}
                onClick={() => void handleFollow()}
                disabled={followBusy}
              >
                <UserCheck size={14} aria-hidden />
                {following ? "已关注" : "关注"}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => router.push(`/messages?with=${encodeURIComponent(username)}`)}
              >
                <MessageCircle size={14} aria-hidden />
                私聊
              </button>
            </span>
          )}
        </div>

        {/* 第三行：简介（独立一行，截断显示，绝不与统计重叠） */}
        <div className="mt-1.5">
          {editingBio ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input min-w-0 max-w-md flex-1 py-1 text-sm"
                value={bioDraft}
                placeholder="介绍一下自己（最多 200 字）"
                onChange={(e) => setBioDraft(e.target.value)}
                maxLength={200}
                aria-label="个人简介"
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveBio()}>
                保存
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingBio(false)}>
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="block max-w-full truncate text-left text-sm transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onClick={() => isMe && setEditingBio(true)}
              title={isMe ? "点击编辑简介" : undefined}
            >
              {bio || (isMe ? <span style={{ color: "var(--color-text-muted)" }}>点击添加简介…</span> : "这个人很懒，还没有简介")}
            </button>
          )}
        </div>
      </div>

      {/* 封面大图查看器（点击封面打开，可下载保存） */}
      {coverViewOpen && cover && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.78)" }}
          onClick={() => setCoverViewOpen(false)}
          role="dialog"
          aria-label="封面大图"
        >
          <div className="flex max-h-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 封面走本地 API */}
            <img
              src={cover}
              alt="空间封面"
              className="max-h-[70vh] max-w-full rounded-[var(--radius-lg)] object-contain"
              style={{ boxShadow: "0 0 48px rgba(125,140,255,0.35)" }}
            />
            <div className="flex items-center gap-2">
              <a
                href={cover}
                download={`${username}-封面.png`}
                className="btn btn-primary btn-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <Download size={14} aria-hidden />
                下载封面
              </a>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ color: "#fff", borderColor: "rgba(255,255,255,0.4)" }}
                onClick={() => setCoverViewOpen(false)}
              >
                <X size={14} aria-hidden />
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 关注/粉丝列表弹窗（自己的空间点击数字查看） */}
      {followList && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={() => setFollowList(null)}
          role="dialog"
          aria-label={followList.kind === "following" ? "关注列表" : "粉丝列表"}
        >
          <div className="card pop-in flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between px-4 py-3">
              <h3 className="text-sm font-semibold">{followList.kind === "following" ? "关注列表" : "粉丝列表"}</h3>
              <button type="button" className="icon-btn" onClick={() => setFollowList(null)} aria-label="关闭">
                <X size={16} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {listLoading ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton h-10" />
                  ))}
                </div>
              ) : followList.items.length === 0 ? (
                <p className="p-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {followList.kind === "following" ? "还没有关注任何人" : "还没有粉丝"}
                </p>
              ) : (
                <ul>
                  {followList.items.map((u) => (
                    <li key={u.username}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-bg-elevated)]"
                        onClick={() => {
                          setFollowList(null);
                          router.push(`/blog/u/${u.username}`);
                        }}
                      >
                        {u.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 头像走本地 API
                          <img src={u.avatarUrl} alt="" width={32} height={32} className="shrink-0 rounded-full object-cover" style={{ width: 32, height: 32 }} />
                        ) : (
                          <span
                            aria-hidden
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                            style={{
                              background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
                              color: "var(--color-primary-fg)",
                            }}
                          >
                            {(u.displayName ?? u.username).slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{u.displayName ?? u.username}</span>
                          <span className="block truncate text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                            @{u.username}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function Stat({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  const content = (
    <>
      <dd className="text-base font-semibold tabular-nums">{value.toLocaleString("zh-CN")}</dd>
      <dt className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </dt>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-baseline gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 transition-colors hover:bg-[var(--color-bg-elevated)]"
        title={`查看${label}列表`}
      >
        {content}
      </button>
    );
  }
  return <div className="flex items-baseline gap-1.5">{content}</div>;
}
