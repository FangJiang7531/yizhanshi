import { headers } from "next/headers";
import { createUserRepository, type UserRepository } from "../repositories/user-repository";
import {
  createVerificationCode,
  consumeSignupToken,
  verifyCode,
} from "./verification-code";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createGuestSession,
  createSessionRecord,
  destroyCurrentSession,
} from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { maskEmail, logger } from "@/lib/logger";
import type { LoginInput, RegisterInput } from "../schemas";

/**
 * 认证服务层：不依赖 cookies() 等请求上下文；
 * 请求元信息（ip / userAgent）由控制器取出后传入。
 */
export function createAuthService(userRepo: UserRepository = createUserRepository()) {
  return {
    /** 请求注册验证码（限流：单邮箱 5 次/小时） */
    async requestCode(email: string) {
      await enforceRateLimit(`code:email:${email}`, 5, 60 * 60 * 1000);
      const existing = await userRepo.findByEmail(email);
      if (existing) {
        throw new ConflictError("该邮箱已注册，请直接登录");
      }
      const code = await createVerificationCode(email, "REGISTER");
      const { sendVerificationCodeEmail } = await import("@/lib/mail");
      await sendVerificationCodeEmail(email, code);
      logger.info({ module: "auth", email: maskEmail(email) }, "verification code sent");
      return { sent: true };
    },

    /** 校验验证码，换取一次性 signupToken */
    async checkCode(email: string, code: string) {
      const result = await verifyCode(email, code, "REGISTER");
      if (!result.ok) {
        const messages: Record<string, string> = {
          expired: "验证码已过期，请重新获取",
          consumed: "验证码已被使用，请重新获取",
          too_many_attempts: "错误次数过多，该验证码已作废，请重新获取",
          mismatch: "验证码错误",
        };
        throw new ValidationError({ code: [messages[result.reason] ?? "验证码错误"] });
      }
      return { signupToken: result.signupToken };
    },

    /** 完成注册：核销 token → 建用户 → 自动登录 */
    async register(data: RegisterInput, meta: { userAgent?: string | null; ip?: string | null; timezone?: string }) {
      await enforceRateLimit(`register:ip:${meta.ip ?? "unknown"}`, 10, 60 * 60 * 1000);

      const signup = await consumeSignupToken(data.signupToken);
      if (!signup) {
        throw new ValidationError({ signupToken: ["注册会话已失效，请重新完成验证码校验"] });
      }

      const usernameLower = data.username.toLowerCase();
      const conflict = await userRepo.existsConflict({ username: usernameLower, email: signup.email });
      if (conflict > 0) {
        throw new ConflictError("用户名或邮箱已被占用");
      }

      const passwordHash = await hashPassword(data.password);
      const user = await userRepo.createWithSetting({
        username: usernameLower,
        email: signup.email,
        passwordHash,
        timezone: meta.timezone,
      });

      const sessionToken = await createSessionRecord(user.id, meta);
      logger.info({ module: "auth", userId: user.id }, "user registered");
      return { id: user.id, username: user.username, email: user.email, sessionToken };
    },

    /**
     * 登录：支持邮箱或用户名。
     * 失败统一为“邮箱/用户名或密码错误”，不区分具体原因（防账号枚举）。
     * 限流：单账号 10 次/10 分钟。
     */
    async login(data: LoginInput, meta: { userAgent?: string | null; ip?: string | null }) {
      const identifier = data.identifier.toLowerCase();
      await enforceRateLimit(`login:id:${identifier}`, 10, 10 * 60 * 1000);

      const user = await userRepo.findByIdentifier(identifier);
      const authOk =
        user && user.passwordHash
          ? await verifyPassword(user.passwordHash, data.password)
          : false;

      if (!user || !authOk) {
        // 统一文案，不泄露账号是否存在
        throw new UnauthorizedError("邮箱/用户名或密码错误");
      }
      if (user.status !== "ACTIVE") {
        throw new ForbiddenError("该账号已被限制登录，请联系管理员");
      }

      await userRepo.touchLogin(user.id);
      const sessionToken = await createSessionRecord(user.id, meta);
      logger.info({ module: "auth", userId: user.id }, "user logged in");
      return { id: user.id, username: user.username, email: user.email, sessionToken };
    },

    /** 访客模式：只写 Cookie，不写库 */
    async enterGuest() {
      await createGuestSession();
      return { guest: true as const };
    },

    /** 登出：删除 Session 记录 + 清 Cookie */
    async logout() {
      await destroyCurrentSession();
      return { loggedOut: true as const };
    },

    /** 未登录访问受保护资源的统一错误 */
    requireLoginError() {
      return new NotFoundError();
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

/** 控制器用的请求元信息提取（Next headers） */
export async function getRequestMeta(): Promise<{ userAgent: string | null; ip: string | null }> {
  const h = await headers();
  return {
    userAgent: h.get("user-agent"),
    ip:
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null,
  };
}
