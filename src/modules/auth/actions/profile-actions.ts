"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireNonGuest } from "@/lib/auth/guards";
import { env } from "@/config/env";
import { storage } from "@/lib/storage";
import { fail, ok, ValidationError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * 个人资料（PRD §7.7 个人资料分区的本期完整实现）：
 * - 显示昵称：可改
 * - 用户名：注册后不可修改（只读展示）
 * - 邮箱：本期只读（变更流程含验证码，后续阶段开放）
 * - 头像：上传图片，经 StorageAdapter 落盘，业务不感知存储介质
 */

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1, "请输入昵称").max(30, "昵称最多 30 字"),
});

export async function updateProfileAction(
  raw: unknown,
): Promise<ActionResult<{ displayName: string }>> {
  try {
    const user = await requireNonGuest();
    const data = updateProfileSchema.parse(raw);
    await prisma.user.update({
      where: { id: user.id },
      data: { displayName: data.displayName },
    });
    revalidatePath("/", "layout");
    return ok({ displayName: data.displayName });
  } catch (err) {
    logger.warn({ module: "profile", err: (err as Error).message }, "updateProfileAction");
    return fail(err);
  }
}

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const AVATAR_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function uploadAvatarAction(
  formData: FormData,
): Promise<ActionResult<{ avatarUrl: string }>> {
  try {
    const user = await requireNonGuest();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return fail(new ValidationError({ file: ["请选择图片文件"] }));
    }
    const ext = AVATAR_TYPES[file.type];
    if (!ext) {
      return fail(new ValidationError({ file: ["仅支持 PNG / JPG / WebP 格式"] }));
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return fail(new ValidationError({ file: ["图片不能超过 2MB"] }));
    }
    if (file.size === 0) {
      return fail(new ValidationError({ file: ["图片内容为空"] }));
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const key = `avatars/${user.id}.${ext}`;
    await storage.put(key, bytes);

    // 带时间戳破缓存，头像 URL 变化让浏览器重新拉取
    const avatarUrl = `/api/files/${key}?v=${Date.now()}`;
    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });

    revalidatePath("/", "layout");
    logger.info({ module: "profile", userId: user.id }, "avatar uploaded");
    return ok({ avatarUrl });
  } catch (err) {
    logger.warn({ module: "profile", err: (err as Error).message }, "uploadAvatarAction");
    return fail(err);
  }
}

export async function removeAvatarAction(): Promise<ActionResult<{ removed: true }>> {
  try {
    const user = await requireNonGuest();
    const current = await prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    });
    if (current?.avatarUrl) {
      // 从 /api/files/avatars/<key>?v=... 还原存储键；清理失败不影响主流程
      const marker = "/api/files/";
      const idx = current.avatarUrl.indexOf(marker);
      if (idx >= 0) {
        const key = current.avatarUrl.slice(idx + marker.length).split("?")[0];
        if (key) await storage.delete(key).catch(() => undefined);
      }
    }
    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
    revalidatePath("/", "layout");
    return ok({ removed: true as const });
  } catch (err) {
    logger.warn({ module: "profile", err: (err as Error).message }, "removeAvatarAction");
    return fail(err);
  }
}

/** 当前存储驱动（供 UI 提示；local 驱动重启容器后文件仍在 volume 中） */
export async function getStorageDriver(): Promise<string> {
  return env.STORAGE_DRIVER;
}
