import type { Priority } from "@prisma/client";

/** 序列化后的任务 DTO（客户端组件只接触可序列化数据） */
export type TaskDTO = {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  /** ISO 8601 UTC 字符串 */
  completedAt: string | null;
  dueAt: string | null;
  /** 服务端按用户时区算好的展示文案：今天/明天/昨天/M月D日 */
  dueLabel: string | null;
  priority: Priority;
  tags: { id: string; name: string; color: string }[];
  createdAt: string;
  updatedAt: string;
};

export type TagDTO = {
  id: string;
  name: string;
  color: string;
};

export type TaskFilter = "today" | "all" | "completed";
