"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/feedback/toast";
import { UserAvatarView } from "@/components/layout/topbar";
import {
  updateProfileAction,
  uploadAvatarAction,
  removeAvatarAction,
} from "@/modules/auth/actions/profile-actions";

/**
 * 个人资料编辑（参照主流资料编辑页设计）：
 * 大圆头像 + 悬停更换遮罩；昵称可改；用户名/邮箱只读并附说明；
 * 保存即时反馈。用户名与邮箱的只读原因就地说明，不留疑问。
 */
export function ProfileForm({
  displayName: initialDisplayName,
  username,
  email,
  avatarUrl: initialAvatarUrl,
  timezone,
}: {
  displayName: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  timezone: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = displayName.trim() !== initialDisplayName;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选择同一文件
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadAvatarAction(fd);
    setUploading(false);
    if (res.success) {
      setAvatarUrl(res.data.avatarUrl);
      toast("success", "头像已更新");
      router.refresh();
    } else {
      toast("error", res.error.message);
    }
  }

  async function handleRemoveAvatar() {
    setUploading(true);
    const res = await removeAvatarAction();
    setUploading(false);
    if (res.success) {
      setAvatarUrl(null);
      toast("success", "已恢复默认头像");
      router.refresh();
    } else {
      toast("error", res.error.message);
    }
  }

  async function handleSave() {
    if (!displayName.trim() || saving) return;
    setSaving(true);
    const res = await updateProfileAction({ displayName: displayName.trim() });
    setSaving(false);
    if (res.success) {
      toast("success", "资料已保存");
      router.refresh();
    } else {
      toast("error", res.error.message);
    }
  }

  return (
    <div className="space-y-8">
      {/* 头像区 */}
      <section className="flex items-center gap-5">
        <div className="group relative">
          <div className="h-20 w-20 overflow-hidden rounded-full ring-2 ring-[var(--color-border)]">
            <UserAvatarView displayName={displayName} avatarUrl={avatarUrl} size={80} />
          </div>
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="更换头像"
          >
            {uploading ? (
              <Loader2 size={18} className="animate-spin text-white" />
            ) : (
              <Camera size={18} className="text-white" />
            )}
          </button>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Camera size={14} />
              更换头像
            </button>
            {avatarUrl && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--color-danger)" }}
                onClick={() => void handleRemoveAvatar()}
                disabled={uploading}
              >
                <Trash2 size={14} />
                移除
              </button>
            )}
          </div>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            支持 PNG / JPG / WebP，不超过 2MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => void handleFileChange(e)}
            aria-label="选择头像图片"
          />
        </div>
      </section>

      {/* 资料字段 */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">显示昵称</span>
          <input
            className="input"
            value={displayName}
            maxLength={30}
            placeholder="别人如何称呼你"
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <span className="mt-1 block text-xs" style={{ color: "var(--color-text-muted)" }}>
            {displayName.length}/30
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">用户名</span>
          <input className="input" value={username} readOnly disabled />
          <span className="mt-1 block text-xs" style={{ color: "var(--color-text-muted)" }}>
            注册后不可修改，是登录与唯一标识
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">邮箱</span>
          <input className="input" value={email} readOnly disabled />
          <span className="mt-1 block text-xs" style={{ color: "var(--color-text-muted)" }}>
            更换邮箱需验证码校验，即将开放
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">时区</span>
          <input className="input" value={timezone} readOnly disabled />
          <span className="mt-1 block text-xs" style={{ color: "var(--color-text-muted)" }}>
            在设置的「偏好」分区修改
          </span>
        </label>
      </section>

      {/* 保存条 */}
      <div className="flex items-center justify-end gap-3 border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
        <span
          className="mr-auto text-xs transition-opacity"
          style={{ color: "var(--color-text-muted)", opacity: dirty ? 1 : 0 }}
          role="status"
        >
          有未保存的修改
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setDisplayName(initialDisplayName)}
          disabled={!dirty || saving}
        >
          还原
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleSave()}
          disabled={!displayName.trim() || !dirty || saving}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : null}
          {saving ? "保存中…" : "保存修改"}
        </button>
      </div>
    </div>
  );
}
