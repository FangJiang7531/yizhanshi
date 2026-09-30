"use server";

import { revalidatePath } from "next/cache";
import { createTaskSchema, updateTaskSchema, toggleTaskSchema, deleteTaskSchema, createTagSchema, listTasksSchema, reorderTasksSchema } from "../schemas";
import { createTaskService } from "../services/task-service";
import { requireNonGuest } from "@/lib/auth/guards";
import { getPrincipal } from "@/lib/auth/session";
import { fail, ok, UnauthorizedError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { toLocalDateString } from "@/lib/date/timezone";

/**
 * 任务控制器（Server Actions）：
 * ① 鉴权（requireNonGuest 拦访客）→ ② Zod 校验 → ③ 服务层 → ④ revalidate。
 * 响应体只含 { success, data | error }，绝不含堆栈/SQL/内部路径。
 */

function revalidateTaskPages() {
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function listTasksAction(raw: unknown): Promise<ActionResult<unknown>> {
  try {
    const principal = await getPrincipal();
    if (!principal) {
      return fail(new UnauthorizedError());
    }
    const data = listTasksSchema.parse(raw);
    const isGuest = "guest" in principal;
    const timezone = isGuest ? "Asia/Shanghai" : principal.user.timezone;
    const userId = isGuest ? null : principal.user.id;
    const service = createTaskService();
    const result = await service.listTasks({ principal: { userId, isGuest }, timezone, ...data });
    return ok(result);
  } catch (err) {
    logger.warn({ module: "tasks", err: (err as Error).message }, "listTasksAction");
    return fail(err);
  }
}

export async function createTaskAction(raw: unknown): Promise<ActionResult<unknown>> {
  try {
    const user = await requireNonGuest();
    const data = createTaskSchema.parse(raw);
    const service = createTaskService();
    const task = await service.createTask({ userId: user.id, timezone: user.timezone }, data);
    revalidateTaskPages();
    return ok(task);
  } catch (err) {
    logger.warn({ module: "tasks", err: (err as Error).message }, "createTaskAction");
    return fail(err);
  }
}

export async function updateTaskAction(raw: unknown): Promise<ActionResult<unknown>> {
  try {
    const user = await requireNonGuest();
    const data = updateTaskSchema.parse(raw);
    const service = createTaskService();
    const task = await service.updateTask({ userId: user.id, timezone: user.timezone }, data);
    revalidateTaskPages();
    return ok(task);
  } catch (err) {
    logger.warn({ module: "tasks", err: (err as Error).message }, "updateTaskAction");
    return fail(err);
  }
}

export async function toggleTaskAction(raw: unknown): Promise<ActionResult<unknown>> {
  try {
    const user = await requireNonGuest();
    const data = toggleTaskSchema.parse(raw);
    const service = createTaskService();
    const task = await service.toggleTask({ userId: user.id, timezone: user.timezone }, data.id, data.completed);
    revalidateTaskPages();
    return ok(task);
  } catch (err) {
    logger.warn({ module: "tasks", err: (err as Error).message }, "toggleTaskAction");
    return fail(err);
  }
}

export async function deleteTaskAction(raw: unknown): Promise<ActionResult<{ deleted: true }>> {
  try {
    const user = await requireNonGuest();
    const data = deleteTaskSchema.parse(raw);
    const service = createTaskService();
    const result = await service.deleteTask({ userId: user.id }, data.id);
    revalidateTaskPages();
    return ok(result);
  } catch (err) {
    logger.warn({ module: "tasks", err: (err as Error).message }, "deleteTaskAction");
    return fail(err);
  }
}

export async function reorderTasksAction(raw: unknown): Promise<ActionResult<{ reordered: true }>> {
  try {
    const user = await requireNonGuest();
    const data = reorderTasksSchema.parse(raw);
    const service = createTaskService();
    const result = await service.reorderTasks({ userId: user.id }, data.ids);
    revalidateTaskPages();
    return ok(result);
  } catch (err) {
    logger.warn({ module: "tasks", err: (err as Error).message }, "reorderTasksAction");
    return fail(err);
  }
}

export async function listTagsAction(): Promise<ActionResult<unknown>> {  try {
    const principal = await getPrincipal();
    if (!principal) return fail(new UnauthorizedError());
    const isGuest = "guest" in principal;
    const service = createTaskService();
    const tags = await service.listTags({ userId: isGuest ? null : principal.user.id, isGuest });
    return ok(tags);
  } catch (err) {
    return fail(err);
  }
}

export async function createTagAction(raw: unknown): Promise<ActionResult<unknown>> {
  try {
    const user = await requireNonGuest();
    const data = createTagSchema.parse(raw);
    const service = createTaskService();
    const tag = await service.createTag({ userId: user.id }, data.name, data.color);
    revalidatePath("/tasks");
    return ok(tag);
  } catch (err) {
    logger.warn({ module: "tasks", err: (err as Error).message }, "createTagAction");
    return fail(err);
  }
}

/** 供客户端对齐“今天”口径：服务端按用户时区返回本地日期串 */
export async function getTodayAction(): Promise<ActionResult<{ today: string }>> {
  try {
    const principal = await getPrincipal();
    if (!principal) return fail(new UnauthorizedError());
    const timezone = "guest" in principal ? "Asia/Shanghai" : principal.user.timezone;
    return ok({ today: toLocalDateString(new Date(), timezone) });
  } catch (err) {
    return fail(err);
  }
}
