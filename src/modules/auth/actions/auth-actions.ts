"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { loginSchema, registerSchema, requestCodeSchema, verifyCodeSchema } from "../schemas";
import { createAuthService, getRequestMeta } from "../services/auth-service";
import { setSessionCookie } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * 认证控制器（Server Actions）：
 * ① 鉴权上下文提取 → ② Zod 校验 → ③ 服务层 → ④ 统一错误收敛。
 * 响应体绝不含堆栈、SQL 或内部路径。
 */

export async function requestCodeAction(raw: unknown): Promise<ActionResult<{ sent: boolean }>> {
  try {
    const data = requestCodeSchema.parse(raw);
    const service = createAuthService();
    const result = await service.requestCode(data.email);
    return ok(result);
  } catch (err) {
    logger.warn({ module: "auth", err: (err as Error).message }, "requestCodeAction");
    return fail(err);
  }
}

export async function verifyCodeAction(
  raw: unknown,
): Promise<ActionResult<{ signupToken: string }>> {
  try {
    const data = verifyCodeSchema.parse(raw);
    const service = createAuthService();
    const result = await service.checkCode(data.email, data.code);
    return ok(result);
  } catch (err) {
    logger.warn({ module: "auth", err: (err as Error).message }, "verifyCodeAction");
    return fail(err);
  }
}

export async function registerAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; username: string; email: string }>> {
  try {
    const data = registerSchema.parse(raw);
    const meta = await getRequestMeta();

    // 客户端在用户本地时区提交 timezone（IANA 名），仅作初始值
    const tzHeader = (await headers()).get("x-user-timezone");
    const timezone = parseTimezone(tzHeader);

    const service = createAuthService();
    const result = await service.register(data, { ...meta, timezone });
    await setSessionCookie(result.sessionToken);
    revalidatePath("/", "layout");
    return ok({ id: result.id, username: result.username, email: result.email });
  } catch (err) {
    logger.warn({ module: "auth", err: (err as Error).message }, "registerAction");
    return fail(err);
  }
}

export async function loginAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; username: string; email: string }>> {
  try {
    const data = loginSchema.parse(raw);
    const meta = await getRequestMeta();
    const service = createAuthService();
    const result = await service.login(data, meta);
    await setSessionCookie(result.sessionToken);
    revalidatePath("/", "layout");
    return ok({ id: result.id, username: result.username, email: result.email });
  } catch (err) {
    logger.warn({ module: "auth", err: (err as Error).message }, "loginAction");
    return fail(err);
  }
}

export async function enterGuestAction(): Promise<ActionResult<{ guest: boolean }>> {
  try {
    const service = createAuthService();
    const result = await service.enterGuest();
    revalidatePath("/", "layout");
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

export async function logoutAction(): Promise<ActionResult<{ loggedOut: boolean }>> {
  try {
    const service = createAuthService();
    const result = await service.logout();
    revalidatePath("/", "layout");
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

function parseTimezone(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}
