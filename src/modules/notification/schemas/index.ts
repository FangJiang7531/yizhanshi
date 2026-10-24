import { z } from "zod";

/** 通知中心 Zod Schema（服务端校验边界） */

export const listNotificationsSchema = z.object({
  cursor: z.string().nullish(),
  take: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.boolean().default(false),
});

export const markReadSchema = z.object({
  ids: z.array(z.string().min(1)).max(100),
});

export const markAllReadSchema = z.object({});

export const followSchema = z.object({ username: z.string().min(1).max(64) });

export const sendTextMessageSchema = z.object({
  username: z.string().min(1).max(64),
  content: z.string().trim().min(1, "消息不能为空").max(2000, "单条消息最多 2000 字"),
});

export const listMessagesSchema = z.object({
  username: z.string().min(1).max(64),
  cursor: z.string().nullish(),
  take: z.coerce.number().int().min(1).max(50).default(30),
});

export const reportUserSchema = z.object({
  username: z.string().min(1).max(64),
  reason: z.string().trim().min(2, "请说明举报原因").max(300),
});

export type ListNotificationsInput = z.infer<typeof listNotificationsSchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
export type FollowInput = z.infer<typeof followSchema>;
export type SendTextMessageInput = z.infer<typeof sendTextMessageSchema>;
export type ListMessagesInput = z.infer<typeof listMessagesSchema>;
export type ReportUserInput = z.infer<typeof reportUserSchema>;
