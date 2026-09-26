import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/config/env";

/**
 * 验证码服务：6 位数字、5 分钟有效、单次消费、存哈希、失败 5 次作废。
 */

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(email: string, code: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(`${email}:${code}`).digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function createVerificationCode(email: string, purpose: "REGISTER"): Promise<string> {
  const code = generateCode();
  await prisma.verificationCode.create({
    data: {
      email,
      purpose,
      codeHash: hashCode(email, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return code;
}

export type VerifyCodeResult =
  | { ok: true; signupToken: string }
  | { ok: false; reason: "expired" | "consumed" | "too_many_attempts" | "mismatch" };

/**
 * 校验验证码。
 * 成功：标记消费并签发一次性 signupToken（5 分钟有效，完成注册时核销）。
 * 失败：attempts+1；≥5 次该码作废。
 */
export async function verifyCode(
  email: string,
  code: string,
  purpose: "REGISTER",
): Promise<VerifyCodeResult> {
  const record = await prisma.verificationCode.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return { ok: false, reason: "expired" };
  if (record.expiresAt <= new Date()) return { ok: false, reason: "expired" };
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  if (!constantTimeEqual(hashCode(email, code), record.codeHash)) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return {
      ok: false,
      reason: record.attempts + 1 >= MAX_ATTEMPTS ? "too_many_attempts" : "mismatch",
    };
  }

  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });

  const signupToken = createHmac("sha256", env.AUTH_SECRET)
    .update(`signup:${record.id}:${record.codeHash}`)
    .digest("hex");

  return { ok: true, signupToken: `${record.id}.${signupToken}` };
}

/** 核销 signupToken：一次性，完成注册时调用 */
export async function consumeSignupToken(
  signupToken: string,
): Promise<{ email: string } | null> {
  const dot = signupToken.indexOf(".");
  if (dot <= 0) return null;
  const recordId = signupToken.slice(0, dot);
  const mac = signupToken.slice(dot + 1);

  const record = await prisma.verificationCode.findUnique({ where: { id: recordId } }).catch(() => null);
  if (!record || !record.consumedAt || record.purpose !== "REGISTER") return null;
  if (record.expiresAt <= new Date()) return null;

  const expected = createHmac("sha256", env.AUTH_SECRET)
    .update(`signup:${record.id}:${record.codeHash}`)
    .digest("hex");
  if (!constantTimeEqual(mac, expected)) return null;

  // signupToken 核销 = 删除对应验证码记录（防止同一 token 注册两次）
  await prisma.verificationCode.delete({ where: { id: record.id } }).catch(() => undefined);
  return { email: record.email };
}
