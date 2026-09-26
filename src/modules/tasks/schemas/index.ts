import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "请输入任务标题").max(200, "标题最多 200 字"),
  description: z.string().trim().max(2000, "描述最多 2000 字").optional().or(z.literal("")),
  /** 客户端按用户时区算好的日期串 YYYY-MM-DD（可选） */
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式不正确")
    .nullable()
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  tagIds: z.array(z.string().cuid()).max(10, "最多选择 10 个标签").default([]),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  id: z.string().cuid(),
});

export const toggleTaskSchema = z.object({
  id: z.string().cuid(),
  completed: z.boolean(),
});

export const deleteTaskSchema = z.object({
  id: z.string().cuid(),
});

export const listTasksSchema = z.object({
  filter: z.enum(["today", "all", "completed"]).default("all"),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(200),
});

export const createTagSchema = z.object({
  name: z.string().trim().min(1, "请输入标签名").max(30, "标签最多 30 字"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "颜色格式不正确").default("#6366F1"),
});

export const reorderTasksSchema = z.object({
  /** 拖拽后的完整任务 id 顺序（仅未完成区参与拖拽） */
  ids: z.array(z.string().cuid()).min(1).max(200),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksInput = z.infer<typeof listTasksSchema>;
export type ReorderTasksInput = z.infer<typeof reorderTasksSchema>;
