"use server";

import { revalidatePath } from "next/cache";
import {
  createHabitSchema,
  updateHabitSchema,
  toggleHabitLogSchema,
  deleteHabitSchema,
} from "../schemas";
import { createHabitService } from "../services/habit-service";
import { requireNonGuest } from "@/lib/auth/guards";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { toLocalDateString } from "@/lib/date/timezone";

/** 习惯控制器（Server Actions）：鉴权 → Zod → 服务层 → revalidate。 */

function revalidateHabitPages() {
  revalidatePath("/habits");
  revalidatePath("/dashboard");
}

export async function createHabitAction(raw: unknown): Promise<ActionResult<unknown>> {
  try {
    const user = await requireNonGuest();
    const data = createHabitSchema.parse(raw);
    const service = createHabitService();
    const habit = await service.createHabit({ userId: user.id }, data);
    revalidateHabitPages();
    return ok(habit);
  } catch (err) {
    logger.warn({ module: "habits", err: (err as Error).message }, "createHabitAction");
    return fail(err);
  }
}

export async function updateHabitAction(raw: unknown): Promise<ActionResult<unknown>> {
  try {
    const user = await requireNonGuest();
    const data = updateHabitSchema.parse(raw);
    const service = createHabitService();
    const result = await service.updateHabit({ userId: user.id }, data);
    revalidateHabitPages();
    return ok(result);
  } catch (err) {
    logger.warn({ module: "habits", err: (err as Error).message }, "updateHabitAction");
    return fail(err);
  }
}

export async function archiveHabitAction(raw: unknown): Promise<ActionResult<unknown>> {
  try {
    const user = await requireNonGuest();
    const data = updateHabitSchema.pick({ id: true }).parse(raw);
    const service = createHabitService();
    const result = await service.archiveHabit({ userId: user.id }, data.id, true);
    revalidateHabitPages();
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteHabitAction(raw: unknown): Promise<ActionResult<unknown>> {
  try {
    const user = await requireNonGuest();
    const data = deleteHabitSchema.parse(raw);
    const service = createHabitService();
    const result = await service.deleteHabit({ userId: user.id }, data.id);
    revalidateHabitPages();
    return ok(result);
  } catch (err) {
    logger.warn({ module: "habits", err: (err as Error).message }, "deleteHabitAction");
    return fail(err);
  }
}

export async function toggleHabitLogAction(raw: unknown): Promise<ActionResult<unknown>> {
  try {
    const user = await requireNonGuest();
    const data = toggleHabitLogSchema.parse(raw);
    const service = createHabitService();
    const today = toLocalDateString(new Date(), user.timezone);
    service.validateLogDate(data.logDate, today);
    const result = await service.toggleLog({ userId: user.id, today }, data.habitId, data.logDate);
    revalidateHabitPages();
    return ok(result);
  } catch (err) {
    logger.warn({ module: "habits", err: (err as Error).message }, "toggleHabitLogAction");
    return fail(err);
  }
}
