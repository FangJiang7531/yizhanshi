import { z } from "zod";

/** 书签模块 Zod Schema */

export const createBookmarkSchema = z.object({
  url: z.string().trim().url("请输入合法的链接").max(2048),
  title: z.string().trim().min(1, "请填写标题").max(300),
  kind: z.enum(["link", "post"]).default("link"),
  description: z.string().trim().max(500).optional(),
  folder: z.string().trim().max(100).default("默认收藏"),
  /** 标签：最多 8 个，单个 ≤20 字 */
  tags: z.array(z.string().trim().min(1).max(20)).max(8).default([]),
  isFavorite: z.boolean().default(false),
  note: z.string().trim().max(2000).optional(),
  /** 站内文章收藏：文章 id */
  postId: z.string().optional(),
});

export const updateBookmarkSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(500).optional(),
  folder: z.string().trim().max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(20)).max(8).optional(),
  isFavorite: z.boolean().optional(),
  note: z.string().trim().max(2000).optional(),
});

export const deleteBookmarkSchema = z.object({ id: z.string().min(1) });

export const listBookmarksSchema = z.object({
  folder: z.string().trim().max(100).optional(),
  tag: z.string().trim().max(20).optional(),
  q: z.string().trim().max(100).optional(),
  kind: z.enum(["link", "post", "all"]).default("all"),
  favoritesOnly: z.boolean().default(false),
});

/** URL 自动补标题时抓取页面 title（服务端出站，走 SSRF 校验） */
export const fetchTitleSchema = z.object({ url: z.string().trim().url().max(2048) });

export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;
export type UpdateBookmarkInput = z.infer<typeof updateBookmarkSchema>;
export type DeleteBookmarkInput = z.infer<typeof deleteBookmarkSchema>;
export type ListBookmarksInput = z.infer<typeof listBookmarksSchema>;
