import { z } from "zod";

/** 短链模块 Zod Schema */

const URL_MAX = 2048;

export const createLinkSchema = z.object({
  kind: z.enum(["url", "file"]).default("url"),
  targetUrl: z.string().trim().url("请输入合法的链接").max(URL_MAX).optional(),
  /** 自定义别名（可选）：3-32 位字母数字-下划线 */
  customSlug: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,32}$/, "别名仅支持字母/数字/-/_，长度 3-32")
    .optional(),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(500).optional(),
  /** 有效期（天），0 = 永久 */
  expiresInDays: z.coerce.number().int().min(0).max(3650).default(0),
});

export const uploadFileLinkSchema = z.object({
  customSlug: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,32}$/, "别名仅支持字母/数字/-/_，长度 3-32")
    .optional(),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(500).optional(),
  expiresInDays: z.coerce.number().int().min(0).max(3650).default(0),
});

export const updateLinkSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(500).optional(),
});

export const deleteLinkSchema = z.object({ id: z.string().min(1) });

export type CreateLinkInput = z.infer<typeof createLinkSchema>;
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;
export type DeleteLinkInput = z.infer<typeof deleteLinkSchema>;
