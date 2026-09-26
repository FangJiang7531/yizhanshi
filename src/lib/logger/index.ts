import pino from "pino";

/** 敏感字段脱敏：密码、令牌、验证码、密钥等永不入日志 */
const REDACT_PATHS = [
  "password",
  "passwordHash",
  "currentPassword",
  "newPassword",
  "confirmPassword",
  "code",
  "codeHash",
  "verificationCode",
  "sessionToken",
  "token",
  "secret",
  "authorization",
  "cookie",
  "req.headers.cookie",
  "AUTH_SECRET",
  "*.password",
  "*.code",
  "*.token",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  base: undefined,
});

/** 邮箱脱敏：a***@example.com */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}
