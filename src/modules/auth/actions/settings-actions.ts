"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireNonGuest } from "@/lib/auth/guards";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** 外观偏好持久化（PRD §7.7：已登录写 UserSetting，访客写 localStorage）。
 *  注意：本 Action 的引用会直接经 Client Component props 传递（Server Component → Client
 *  Component 只允许传 Server Action，不能传内联闭包），因此签名必须与调用方约定一致。 */
const updateAppearanceSchema = z.object({
  themeName: z.enum([
    "classic-paper",
    "tech",
    "botanical",
    "minimal",
    "pure-white",
    "pure-black",
  ]),
  colorMode: z.enum(["light", "dark", "system"]),
  motionEnabled: z.boolean(),
});

export async function updateAppearanceAction(
  raw: unknown,
): Promise<ActionResult<{ saved: true }>> {
  try {
    const user = await requireNonGuest();
    const data = updateAppearanceSchema.parse(raw);
    await prisma.userSetting.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        themeName: data.themeName,
        colorMode: data.colorMode.toUpperCase() as "LIGHT" | "DARK" | "SYSTEM",
        motionEnabled: data.motionEnabled,
      },
      update: {
        themeName: data.themeName,
        colorMode: data.colorMode.toUpperCase() as "LIGHT" | "DARK" | "SYSTEM",
        motionEnabled: data.motionEnabled,
      },
    });
    revalidatePath("/settings");
    return ok({ saved: true as const });
  } catch (err) {
    logger.warn({ module: "settings", err: (err as Error).message }, "updateAppearanceAction");
    return fail(err);
  }
}

/**
 * 外观偏好持久化（供 ThemeProvider 直接引用的 Server Action）。
 *
 * 签名必须与 ThemeProvider 的 `persistToServer` 约定一致：`(prefs) => Promise<void>`。
 * 原因：Server Component → Client Component 只能传 Server Action 的**引用**，
 * 不能传内联闭包（内联函数在 RSC 边界不可序列化）。失败时静默记录，
 * 不向 UI 抛错——主题已在本地下发生效，落库失败不应打断用户操作。
 */
export async function persistAppearanceAction(prefs: {
  themeName: string;
  colorMode: string;
  motionEnabled: boolean;
}): Promise<void> {
  try {
    const user = await requireNonGuest();
    const data = updateAppearanceSchema.parse(prefs);
    await prisma.userSetting.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        themeName: data.themeName,
        colorMode: data.colorMode.toUpperCase() as "LIGHT" | "DARK" | "SYSTEM",
        motionEnabled: data.motionEnabled,
      },
      update: {
        themeName: data.themeName,
        colorMode: data.colorMode.toUpperCase() as "LIGHT" | "DARK" | "SYSTEM",
        motionEnabled: data.motionEnabled,
      },
    });
  } catch (err) {
    logger.warn({ module: "settings", err: (err as Error).message }, "persistAppearanceAction");
  }
}

/** 偏好设置：时区（写 User.timezone，影响问候语与“今日”口径）+ 每周起始日 + 语言 */
const updatePreferencesSchema = z.object({
  timezone: z
    .string()
    .min(1)
    .max(64)
    .refine(
      (v) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      },
      { message: "时区不合法" },
    ),
  weekStartDay: z.union([z.literal(0), z.literal(1)]),
  locale: z.enum(["zh-CN", "en-US"]),
});

export async function updatePreferencesAction(
  raw: unknown,
): Promise<ActionResult<{ saved: true }>> {
  try {
    const user = await requireNonGuest();
    const data = updatePreferencesSchema.parse(raw);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { timezone: data.timezone } }),
      prisma.userSetting.update({
        where: { userId: user.id },
        data: { weekStartDay: data.weekStartDay, locale: data.locale },
      }),
    ]);
    revalidatePath("/", "layout");
    return ok({ saved: true as const });
  } catch (err) {
    logger.warn({ module: "settings", err: (err as Error).message }, "updatePreferencesAction");
    return fail(err);
  }
}

/** 通知偏好：本期仅存偏好，不实际推送（PRD §1.3 明确边界） */
const updateNotificationSchema = z.object({
  notifyEmail: z.boolean(),
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间格式应为 HH:mm")
    .nullable(),
});

export async function updateNotificationAction(
  raw: unknown,
): Promise<ActionResult<{ saved: true }>> {
  try {
    const user = await requireNonGuest();
    const data = updateNotificationSchema.parse(raw);
    await prisma.userSetting.update({
      where: { userId: user.id },
      data: { notifyEmail: data.notifyEmail, reminderTime: data.reminderTime },
    });
    revalidatePath("/settings");
    return ok({ saved: true as const });
  } catch (err) {
    logger.warn({ module: "settings", err: (err as Error).message }, "updateNotificationAction");
    return fail(err);
  }
}
