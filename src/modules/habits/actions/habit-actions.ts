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
import type { HabitDTO, ToggleLogResult } from "../types";

/** 习惯控制器（Server Actions）：鉴权 → Zod → 服务层 → revalidate。 */

function revalidateHabitPages() {
  revalidatePath("/habits");
  revalidatePath("/dashboard");
}

export async function createHabitAction(raw: unknown): Promise<ActionResult<HabitDTO>> {
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

export async function updateHabitAction(
  raw: unknown,
): Promise<ActionResult<HabitDTO>> {
  try {
    const user = await requireNonGuest();
    const data = updateHabitSchema.parse(raw);
    const service = createHabitService();
    await service.updateHabit({ userId: user.id }, data);
    revalidateHabitPages();
    // 更新返回完整 DTO（含统计），供看板本地同步，避免仅靠 router.refresh() 造成的状态滞后
    const list = await service.listHabits({
      principal: { userId: user.id, isGuest: false },
      today: toLocalDateString(new Date(), user.timezone),
    });
    const habit = list.find((h) => h.id === data.id);
    if (!habit) return fail(new Error("习惯不存在或无权访问"));
    return ok(habit);
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

export async function unarchiveHabitAction(raw: unknown): Promise<ActionResult<unknown>> {
  try {
    const user = await requireNonGuest();
    const data = updateHabitSchema.pick({ id: true }).parse(raw);
    const service = createHabitService();
    const result = await service.archiveHabit({ userId: user.id }, data.id, false);
    revalidateHabitPages();
    return ok(result);
  } catch (err) {
    logger.warn({ module: "habits", err: (err as Error).message }, "unarchiveHabitAction");
    return fail(err);
  }
}

/** 已归档习惯列表（归档管理区用，轻量字段） */
export async function listArchivedHabitsAction(): Promise<ActionResult<unknown>> {
  try {
    const user = await requireNonGuest();
    const service = createHabitService();
    const habits = await service.listArchivedHabits({ userId: user.id });
    return ok(habits);
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

export async function toggleHabitLogAction(raw: unknown): Promise<ActionResult<ToggleLogResult>> {
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
