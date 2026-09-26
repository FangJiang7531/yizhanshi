import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/config/env";

/**
 * 会话机制（PRD §6.4）：
 * - 数据库 Session（非 JWT，不存 localStorage）
 * - Cookie：HttpOnly + Secure（生产）+ SameSite=Lax + Path=/
 * - 30 天滑动续期
 * - 登出删除 Session 记录，令牌立即失效
 * - 访客：同一套 Cookie 机制，role=GUEST 且不写库（服务层短路）
 */

export const SESSION_COOKIE = "pwb_session";
export const GUEST_COOKIE = "pwb_guest";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GUEST_TTL_S = 30 * 24 * 60 * 60;
/** 剩余寿命低于该阈值时滑动续期 */
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  role: Role;
  timezone: string;
  avatarUrl: string | null;
};

export type GuestPrincipal = {
  role: Extract<Role, "GUEST">;
  displayName: string;
};

export type Principal = { user: SessionUser } | { guest: GuestPrincipal };

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${ip}:${env.AUTH_SECRET}`).digest("hex");
}

/** 为正式用户创建数据库会话记录（纯 DB 操作，服务层可安全调用；Cookie 写入由控制器完成） */
export async function createSessionRecord(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<string> {
  const sessionToken = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      sessionToken,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: meta.userAgent ?? null,
      ipHash: hashIp(meta.ip ?? undefined),
    },
  });
  return sessionToken;
}

/** 控制器专用：把会话令牌写入 HttpOnly Cookie */
export async function setSessionCookie(sessionToken: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionToken, cookieOptions(SESSION_TTL_MS / 1000));
}

/** 为正式用户创建数据库会话并写入 Cookie（控制器便捷封装） */
export async function createUserSession(userId: string, meta: { userAgent?: string | null; ip?: string | null }) {
  const token = await createSessionRecord(userId, meta);
  await setSessionCookie(token);
}

/** 进入访客模式：只写 Cookie，不写库（从根本上消除数据污染风险） */
export async function createGuestSession() {
  const store = await cookies();
  store.set(GUEST_COOKIE, "1", cookieOptions(GUEST_TTL_S));
}

/** 登出：服务端删除 Session 记录（不只清 Cookie），令牌立即失效 */
export async function destroyCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { sessionToken: token } });
  }
  store.delete(SESSION_COOKIE);
  store.delete(GUEST_COOKIE);
}

async function loadPrincipal(): Promise<Principal | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await prisma.session.findUnique({
      where: { sessionToken: token },
      include: { user: true },
    });
    if (session && session.expiresAt > new Date() && session.user.status === "ACTIVE") {
      // 滑动续期：剩余寿命不足一半时顺延
      if (session.expiresAt.getTime() - Date.now() < RENEW_THRESHOLD_MS) {
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
        await prisma.session.update({ where: { id: session.id }, data: { expiresAt } });
      }
      const u = session.user;
      return {
        user: {
          id: u.id,
          username: u.username,
          email: u.email,
          displayName: u.displayName,
          role: u.role,
          timezone: u.timezone,
          avatarUrl: u.avatarUrl,
        },
      };
    }
  }
  if (store.get(GUEST_COOKIE)?.value === "1") {
    return { guest: { role: "GUEST", displayName: "访客" } };
  }
  return null;
}

/** 请求级缓存的主体验（同一渲染周期只查一次库） */
export const getPrincipal = cache(loadPrincipal);

/** 会话 Cookie 是否存在（供 middleware 粗判用，不做真伪校验） */
export function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.includes(`${SESSION_COOKIE}=`) || cookieHeader.includes(`${GUEST_COOKIE}=`);
}
