import { z } from "zod";

/** 管理后台 Schema（全部动作前置 requireAdmin，与用户端完全隔离） */

export const adminLoginStep1Schema = z.object({
  account: z.string().trim().min(1, "请输入邮箱或用户名").max(100),
  password: z.string().min(1, "请输入密码").max(200),
});

export const adminLoginStep2Schema = z.object({
  accessKey: z.string().trim().min(1, "请输入管理密钥").max(200),
});

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ALL", "ACTIVE", "SUSPENDED"]).default("ALL"),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

export const banUserSchema = z.object({
  userId: z.string().min(1),
  banned: z.boolean(),
});

export const badgeSchema = z.object({
  userId: z.string().min(1),
  text: z.string().trim().min(1, "称号文字必填").max(20),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "颜色需为 #RRGGBB"),
  bgColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  enabled: z.boolean().default(true),
});

export const announcementSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(2000),
  level: z.enum(["info", "warning", "critical"]).default("info"),
  active: z.boolean().default(true),
});

export const featureFlagSchema = z.object({
  key: z.string().trim().min(1).max(50),
  enabled: z.boolean(),
  disabledReason: z.string().trim().max(200).optional(),
});

export const systemMessageSchema = z.object({
  userId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(2000),
});

export const broadcastSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(2000),
});

export const moderationActionSchema = z.object({
  kind: z.enum(["post", "comment"]),
  id: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(300).optional(),
});

export const blockedActionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["dismiss"]),
});
