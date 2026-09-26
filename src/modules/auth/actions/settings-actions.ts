"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireNonGuest } from "@/lib/auth/guards";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** 外观偏好持久化（PRD §7.7：已登录写 UserSetting，访客写 localStorage） */
const updateAppearanceSchema = z.object({
  themeName: z.enum([
    "classic-paper",
    "tech",
    "botanical",
    "minimal",
    "pure-white",
    "pure-black",
  ]),
  colorMode: z.enum(["LIGHT", "DARK", "SYSTEM"]),
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
        colorMode: data.colorMode,
        motionEnabled: data.motionEnabled,
      },
      update: {
        themeName: data.themeName,
        colorMode: data.colorMode,
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
