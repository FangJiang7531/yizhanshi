import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { env } from "@/config/env";
import { UnauthorizedError } from "@/lib/errors";

/**
 * 管理端鉴权（与用户端完全隔离）：
 * - 独立 Cookie（pwb_admin）+ 独立会话表（AdminSession），与用户 Session 互不相通；
 * - 双因子：账号密码（第一因子，只验证身份不建会话）→ 服务器下发密钥（第二因子）→ 才发放管理会话；
 * - 用户端任何 Cookie/角色都无法触达管理端：requireAdmin 只认 AdminSession + role=ADMIN + ACTIVE。
 */

export const ADMIN_COOKIE = "pwb_admin";
/** 第一因子通过后的预验证 Cookie（短时效签名，不落库） */
export const ADMIN_PRE_COOKIE = "pwb_admin_pre";

const ADMIN_TTL_MS = 8 * 60 * 60 * 1000; // 8 小时
const PRE_TTL_MS = 5 * 60 * 1000; // 密钥验证窗口 5 分钟

export type AdminUser = {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
};

function sign(payload: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(payload).digest("base64url");
}

/** 第一因子签发：预验证票据（userId+过期时间 签名） */
export function issuePreAuthTicket(userId: string): { value: string; maxAge: number } {
  const exp = Date.now() + PRE_TTL_MS;
  const payload = `${userId}.${exp}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: Math.floor(PRE_TTL_MS / 1000) };
}

/** 校验预验证票据 → userId（无效返回 null） */
export function verifyPreAuthTicket(value: string | undefined): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts as [string, string, string];
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  const expected = sign(`${userId}.${exp}`);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return userId;
}

/** 第二因子：密钥校验（与 env.ADMIN_ACCESS_KEY 时序安全比较） */
export function verifyAdminKey(key: string): boolean {
  const expected = env.ADMIN_ACCESS_KEY;
  if (!expected) return false; // 未配置 = 管理端登录关闭
  const a = Buffer.from(key);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${ip}:${env.AUTH_SECRET}`).digest("hex");
}

/** 建立管理会话：返回 token（控制器写入 Cookie） */
export async function createAdminSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.adminSession.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + ADMIN_TTL_MS),
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
      ipHash: hashIp(meta.ip ?? undefined),
    },
  });
  return token;
}

/** 当前管理员（请求级缓存）；无有效管理会话返回 null */
export const getAdminUser = cache(async (): Promise<AdminUser | null> => {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.adminSession.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  const u = session.user;
  if (u.role !== "ADMIN" || u.status !== "ACTIVE") return null;
  return { id: u.id, username: u.username, displayName: u.displayName, email: u.email };
});

/** 服务端动作/页面的管理守卫：只认 AdminSession，不认用户 Session */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) throw new UnauthorizedError("管理会话无效");
  return admin;
}

/** 管理登出：删会话记录（令牌立即失效） */
export async function destroyAdminSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (token) {
    await prisma.adminSession.deleteMany({ where: { token } });
  }
}

export function adminCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const, // 管理会话更严格：不跨站携带
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
