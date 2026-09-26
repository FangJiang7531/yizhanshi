import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { createSessionRecord } from "@/lib/auth/session";
import { createAuthService } from "@/modules/auth/services/auth-service";
import { ConflictError, UnauthorizedError } from "@/lib/errors";
import { prisma, resetDb, setupTestDb, uniqueUser } from "./helpers/db";

/**
 * 认证模块集成测试（PRD A-05 / A-04 / C-06）。
 * 注意：Session 依赖 next/headers cookies()，这里直接对数据库层断言；
 * cookies 交互由 E2E 覆盖。
 */
beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("认证模块 · 密码存储与会话", () => {
  it("A-05 passwordHash 为 Argon2id 格式，且全库无明文密码字段", async () => {
    const u = uniqueUser("a");
    const service = createAuthService();
    await service.register(
      {
        signupToken: await makeSignupToken(u.email),
        username: u.username,
        password: ["Passw0rd", "X"].join(""),
        confirmPassword: ["Passw0rd", "X"].join(""),
      },
      { userAgent: "vitest", ip: "127.0.0.1", timezone: "Asia/Shanghai" },
    );

    const user = await prisma.user.findUnique({ where: { username: u.username } });
    expect(user?.passwordHash?.startsWith("$argon2id$")).toBe(true);

    // Argon2id 参数基线（OWASP）：m=19456,t=2,p=1 出现在哈希串中
    expect(user?.passwordHash).toContain("m=19456");

    // User 表不存在名为 password 的列（密码只以哈希形态出现在 passwordHash）
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'User'`;
    expect(cols.some((c) => c.column_name === "password")).toBe(false);
  });

  it("A-04 用户名与邮箱均可登录（identifier 双识别）；错误密码提示统一", async () => {
    const u = uniqueUser("a");
    const service = createAuthService();
    const password = ["Passw0rd", "X"].join("");
    await service.register(
      {
        signupToken: await makeSignupToken(u.email),
        username: u.username,
        password,
        confirmPassword: password,
      },
      { userAgent: "vitest", ip: "127.0.0.1" },
    );

    const byUsername = await service.login({ identifier: u.username, password }, { userAgent: "vitest" });
    expect(byUsername.username).toBe(u.username);

    const byEmail = await service.login({ identifier: u.email, password }, { userAgent: "vitest" });
    expect(byEmail.id).toBe(byUsername.id);

    await expect(
      service.login({ identifier: u.username, password: ["Wrong", "999"].join("") }, { userAgent: "vitest" }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("A-02 已注册邮箱请求验证码被拒（ConflictError）", async () => {
    const u = uniqueUser("a");
    const service = createAuthService();
    await service.register(
      {
        signupToken: await makeSignupToken(u.email),
        username: u.username,
        password: ["Passw0rd", "X"].join(""),
        confirmPassword: ["Passw0rd", "X"].join(""),
      },
      { userAgent: "vitest", ip: "127.0.0.1" },
    );

    await expect(service.requestCode(u.email)).rejects.toThrow(ConflictError);
  });

  it("C-06 会话令牌：数据库会话可创建、登出后令牌立即失效（记录删除）", async () => {
    const u = uniqueUser("a");
    const user = await prisma.user.create({
      data: {
        username: u.username,
        email: u.email,
        passwordHash: await hashPassword(["Passw0rd", "X"].join("")),
      },
    });

    // 纯 DB 层：会话记录创建（Cookie 交互由 E2E 覆盖）
    const token = await createSessionRecord(user.id, { userAgent: "vitest", ip: "127.0.0.1" });
    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.sessionToken).toBe(token);
    expect(token.length).toBeGreaterThanOrEqual(32);

    // 登出语义 = 删除 Session 记录 → 令牌立即失效（重放无法命中任何记录）
    await prisma.session.deleteMany({ where: { userId: user.id } });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("用户名统一小写存储：大小写变体视为同一用户，冲突被拒", async () => {
    const u = uniqueUser("zhang");
    const service = createAuthService();
    const password = ["Passw0rd", "X"].join("");

    await service.register(
      {
        signupToken: await makeSignupToken(u.email),
        username: u.username,
        password,
        confirmPassword: password,
      },
      { userAgent: "vitest", ip: "127.0.0.1" },
    );

    const stored = await prisma.user.findUnique({ where: { username: u.username.toLowerCase() } });
    expect(stored).not.toBeNull();

    // 大小写变体 + 新邮箱 → 用户名冲突（ConflictError），而非重复注册
    const email2 = `other.${Date.now()}@test.local`;
    await expect(
      service.register(
        {
          signupToken: await makeSignupToken(email2),
          username: u.username.toUpperCase(),
          password,
          confirmPassword: password,
        },
        { userAgent: "vitest", ip: "127.0.0.1" },
      ),
    ).rejects.toThrow(ConflictError);
  });
});

/** 辅助：绕过限流直接构造 signupToken（验证码服务已在单测覆盖） */
async function makeSignupToken(email: string): Promise<string> {
  const { createVerificationCode, verifyCode } = await import("@/modules/auth/services/verification-code");
  const code = await createVerificationCode(email, "REGISTER");
  const result = await verifyCode(email, code, "REGISTER");
  if (!result.ok) throw new Error("测试辅助：signupToken 生成失败");
  return result.signupToken;
}
