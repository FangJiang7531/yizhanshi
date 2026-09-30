"use server";

import { requireNonGuest } from "@/lib/auth/guards";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { toLocalDateString } from "@/lib/date/timezone";
import { buildDataCardSchema } from "../schemas";
import { createDataCardService, type HabitCardSource } from "../services/data-card.service";

/**
 * 数据卡片控制器（编辑器"插入数据卡片"，PRD A-20）。
 *
 * 与其余 Action 同一流水线：权限守卫 → Zod 校验 → 服务层。
 * "今天"由服务端按用户时区计算，客户端不需要传日期（避免客户端时钟漂移影响快照）。
 */

export async function listDataCardSourcesAction(): Promise<ActionResult<{ habits: HabitCardSource[] }>> {
  try {
    const user = await requireNonGuest();
    const today = toLocalDateString(new Date(), user.timezone);
    const service = createDataCardService();
    return ok({ habits: await service.listHabitSources(user.id, today) });
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "listDataCardSourcesAction");
    return fail(err);
  }
}

export async function buildDataCardAction(raw: unknown): Promise<ActionResult<{ marker: string }>> {
  try {
    const user = await requireNonGuest();
    const data = buildDataCardSchema.parse(raw);
    const today = toLocalDateString(new Date(), user.timezone);
    const service = createDataCardService();
    return ok(await service.buildCard(user.id, data, today, user.timezone));
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "buildDataCardAction");
    return fail(err);
  }
}
