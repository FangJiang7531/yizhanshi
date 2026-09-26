import { z } from "zod";

/** 保留用户名（与 admin、root 等系统语义冲突，禁止注册） */
export const RESERVED_USERNAMES = [
  "admin",
  "administrator",
  "root",
  "system",
  "support",
  "moderator",
  "official",
  "guest",
  "null",
  "undefined",
];

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "用户名至少 3 个字符")
  .max(20, "用户名最多 20 个字符")
  .regex(/^[A-Za-z0-9_]+$/, "仅允许英文、数字、下划线")
  .refine((v) => !RESERVED_USERNAMES.includes(v.toLowerCase()), "该用户名为保留字");

export const passwordSchema = z
  .string()
  .min(8, "密码至少 8 位")
  .max(64, "密码最多 64 位")
  .regex(/[A-Z]/, "需包含大写字母")
  .regex(/[a-z]/, "需包含小写字母")
  .regex(/[0-9]/, "需包含数字");

export const emailSchema = z.string().trim().toLowerCase().email("邮箱格式不正确").max(254);

/** 请求验证码 */
export const requestCodeSchema = z.object({
  email: emailSchema,
});

/** 校验验证码（成功后发放一次性 signupToken） */
export const verifyCodeSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, "验证码为 6 位数字"),
});

/** 完成注册 */
export const registerSchema = z
  .object({
    signupToken: z.string().min(1),
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

/** 登录：identifier 可为邮箱或用户名 */
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "请输入邮箱或用户名").max(254),
  password: z.string().min(1, "请输入密码").max(64),
});

export type UsernameSchema = typeof usernameSchema;
export type PasswordSchema = typeof passwordSchema;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
