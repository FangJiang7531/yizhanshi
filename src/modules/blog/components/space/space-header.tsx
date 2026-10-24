"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/feedback/toast";
import { uploadCoverAction, removeCoverAction, updateProfileAction } from "@/modules/auth/actions/profile-actions";
import { UserAvatarMenu } from "@/modules/notification/components/user-avatar-menu";

/**
 * 空间头部（客户端）：封面（挂图/上传）+ 圆形头像 + 昵称/简介/资料设置 + 关注·粉丝·动态。
 * 手机端「下拉到顶放大封面并丝滑回弹」：全局监听 touch——页面已滚到顶（scrollY≤0）仍向下拉时
 * 按下拉距离放大封面，松手后以弹性缓动回弹（prefers-reduced-motion 时禁用）。
 */
export function SpaceHeader({
  username,
  displayName,
  bio,
  avatarUrl,
  coverImage,
  stats,
  isMe,
}: {
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  coverImage: string | null;
  stats: { following: number; followers: number; posts: number };
  isMe: boolean;
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

  const name = displayName;

  return (
    <header className="relative overflow-hidden rounded-[var(--radius-lg)]">
      {/* 封面：有图挂图，无图用主题渐变；下拉时放大（手机端 overscroll 弹性） */}
      <div
        className="relative h-40 sm:h-52"
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
            <div className="absolute bottom-3 right-3 flex gap-2">
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

      {/* 信息区：头像叠在封面下缘 */}
      <div className="relative flex flex-wrap items-end gap-4 px-5 pb-4">
        <div className="-mt-8 sm:-mt-10">
          <UserAvatarMenu username={username} displayName={name} avatarUrl={avatarUrl} isMe={isMe}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 头像走本地 API
              <img
                src={avatarUrl}
                alt=""
                width={72}
                height={72}
                className="rounded-full border-4 object-cover"
                style={{
                  width: 72,
                  height: 72,
                  borderColor: "var(--color-bg-surface)",
                }}
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
          </UserAvatarMenu>
        </div>

        <div className="min-w-0 flex-1 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            {editingName ? (
              <span className="flex items-center gap-2">
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
              <h1 className="truncate text-lg font-semibold">{name}</h1>
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
          </div>

          {editingBio ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                className="input max-w-md py-1 text-sm"
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
              className="mt-0.5 block max-w-md truncate text-left text-sm transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onClick={() => isMe && setEditingBio(true)}
              title={isMe ? "点击编辑简介" : undefined}
            >
              {bio || (isMe ? <span style={{ color: "var(--color-text-muted)" }}>点击添加简介…</span> : "这个人很懒，还没有简介")}
            </button>
          )}
        </div>

        {/* 关注 / 粉丝 / 动态 */}
        <dl className="flex items-center gap-5 pb-1 text-sm">
          <Stat label="关注" value={stats.following} />
          <Stat label="粉丝" value={stats.followers} />
          <Stat label="动态" value={stats.posts} />
        </dl>
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dd className="text-base font-semibold tabular-nums">{value.toLocaleString("zh-CN")}</dd>
      <dt className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </dt>
    </div>
  );
}
