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
