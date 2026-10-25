"use server";

import { cookies, headers } from "next/headers";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { env } from "@/config/env";
import {
  ADMIN_COOKIE,
  ADMIN_PRE_COOKIE,
  adminCookieOptions,
  createAdminSession,
  destroyAdminSession,
  issuePreAuthTicket,
  verifyAdminKey,
  verifyPreAuthTicket,
} from "@/lib/auth/admin-guard";
import { adminLoginStep1Schema, adminLoginStep2Schema } from "../schemas";

/**
 * 管理端登录（双因子，独立于用户登录）：
 * ① 账号密码 → 仅验证身份（要求 role=ADMIN），发放 5 分钟预验证票据；
 * ② 管理密钥（服务器 .env 下发）→ 通过后建立 AdminSession（pwb_admin Cookie）。
 * 用户端 Cookie / 用户登录流程与此完全隔离。
 */

const STEP1_COOKIES = 8 * 60 * 60 * 1000; // 仅日志审计用

export async function adminLoginStep1Action(
  raw: unknown,
): Promise<ActionResult<{ stage: "key" }>> {
  try {
    const data = adminLoginStep1Schema.parse(raw);
    const account = data.account.toLowerCase();
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: account }, { username: account }] },
      select: { id: true, passwordHash: true, role: true, status: true },
    });

    // 统一失败文案（防账号枚举）；无密码用户（OAuth-only）不允许进管理端
    const invalid = () => new Error("账号、密码、密钥或权限有误");
    if (!user || !user.passwordHash || user.role !== "ADMIN" || user.status !== "ACTIVE") {
      throw invalid();
    }
    const passOk = await verifyPassword(user.passwordHash, data.password);
    if (!passOk) throw invalid();

    // 第一因子通过：短时效预验证票据
    const store = await cookies();
    const ticket = issuePreAuthTicket(user.id);
    store.set(ADMIN_PRE_COOKIE, ticket.value, adminCookieOptions(ticket.maxAge));
    logger.info({ module: "admin-auth", userId: user.id }, "管理端第一因子通过");
    return ok({ stage: "key" });
  } catch (err) {
    logger.warn({ module: "admin-auth", err: (err as Error).message }, "adminLoginStep1");
    return fail(err);
  }
}

export async function adminLoginStep2Action(
  raw: unknown,
): Promise<ActionResult<{ granted: true }>> {
  try {
    const data = adminLoginStep2Schema.parse(raw);
    const store = await cookies();
    const userId = verifyPreAuthTicket(store.get(ADMIN_PRE_COOKIE)?.value);
    if (!userId) throw new Error("登录会话已过期，请重新输入账号密码");

    if (!verifyAdminKey(data.accessKey)) {
      throw new Error("管理密钥不正确");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
    if (!user || user.role !== "ADMIN" || user.status !== "ACTIVE") {
      throw new Error("账号、密码、密钥或权限有误");
    }

    // 建立管理会话
    const h = await headers();
    const token = await createAdminSession(user.id, {
      userAgent: h.get("user-agent"),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });
    store.set(ADMIN_COOKIE, token, adminCookieOptions(Math.floor(STEP1_COOKIES / 1000)));
    store.delete(ADMIN_PRE_COOKIE);
    logger.info({ module: "admin-auth", userId: user.id }, "管理端登录成功（双因子）");
    return ok({ granted: true });
  } catch (err) {
    logger.warn({ module: "admin-auth", err: (err as Error).message }, "adminLoginStep2");
    return fail(err);
  }
}

export async function adminLogoutAction(): Promise<ActionResult<{ loggedOut: true }>> {
  try {
    await destroyAdminSession();
    const store = await cookies();
    store.delete(ADMIN_PRE_COOKIE);
    return ok({ loggedOut: true });
  } catch (err) {
    return fail(err);
  }
}

/** 管理端登录页可用性（密钥是否已在服务器配置；不回传任何密钥信息） */
export async function adminLoginAvailableAction(): Promise<
  ActionResult<{ available: boolean }>
> {
  return ok({ available: Boolean(env.ADMIN_ACCESS_KEY) });
}
