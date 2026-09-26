import type { Task } from "@prisma/client";
import { createTaskRepository, type TaskRepository } from "../repositories/task-repository";
import { createTagRepository, type TagRepository } from "../repositories/tag-repository";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { getDayRangeInTimezone, toLocalDateString, formatDueDate } from "@/lib/date/timezone";
import type { CreateTaskInput, UpdateTaskInput } from "../schemas";
import type { TaskDTO, TaskFilter } from "../types";

/** 访客模式的预设只读样例（不查真实库，从根源上消除数据污染风险） */
export const GUEST_DEMO_TASKS: TaskDTO[] = [
  {
    id: "demo-task-1",
    title: "欢迎使用任务清单（演示数据）",
    description: "注册账号后，这里就是你自己创建的任务了。",
    completed: false,
    completedAt: null,
    dueAt: null,
    dueLabel: null,
    priority: "MEDIUM",
    tags: [
      { id: "demo-tag-1", name: "演示", color: "#6366F1" },
      { id: "demo-tag-2", name: "入门", color: "#4A7C59" },
    ],
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
  },
  {
    id: "demo-task-2",
    title: "体验：勾选完成一个任务",
    description: "点击左侧复选框即可完成（访客模式下演示，不会真正保存）。",
    completed: false,
    completedAt: null,
    dueAt: null,
    dueLabel: null,
    priority: "HIGH",
    tags: [{ id: "demo-tag-1", name: "演示", color: "#6366F1" }],
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
  },
  {
    id: "demo-task-3",
    title: "已完成的示例任务",
    description: "完成任务会显示划线与置灰效果。",
    completed: true,
    completedAt: "2026-09-25T12:00:00.000Z",
    dueAt: null,
    dueLabel: null,
    priority: "LOW",
    tags: [],
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-25T12:00:00.000Z",
  },
];

type TaggedTask = Task & { tags: { tag: { id: string; name: string; color: string } }[] };

export function serializeTask(task: TaggedTask, timezone: string, now = new Date()): TaskDTO {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    completed: task.completed,
    completedAt: task.completedAt?.toISOString() ?? null,
    dueAt: task.dueAt?.toISOString() ?? null,
    dueLabel: task.dueAt ? formatDueDate(task.dueAt, timezone, now) : null,
    priority: task.priority,
    tags: task.tags.map((tt) => ({ id: tt.tag.id, name: tt.tag.name, color: tt.tag.color })),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

/**
 * 任务服务层：业务规则与编排。签名不含任何 HTTP 上下文，
 * userId / timezone 由控制器（Server Action / RSC）从会话取出后传入。
 */
export function createTaskService(taskRepo: TaskRepository = createTaskRepository(), tagRepo: TagRepository = createTagRepository()) {
  return {
    async listTasks(params: {
      principal: { userId: string | null; isGuest: boolean };
      timezone: string;
      filter: TaskFilter;
      search?: string;
      page?: number;
      pageSize?: number;
    }): Promise<{ items: TaskDTO[]; total: number }> {
      if (params.principal.isGuest || params.principal.userId === null) {
        const search = params.search?.toLowerCase();
        let items = GUEST_DEMO_TASKS;
        if (params.filter === "completed") items = items.filter((t) => t.completed);
        if (params.filter === "today") items = items.filter((t) => !t.completed);
        if (search) {
          items = items.filter(
            (t) => t.title.toLowerCase().includes(search) || (t.description ?? "").toLowerCase().includes(search),
          );
        }
        return { items, total: items.length };
      }

      const now = new Date();
      const todayRange =
        params.filter === "today" ? getDayRangeInTimezone(now, params.timezone) : undefined;
      const { items, total } = await taskRepo.findMany({
        userId: params.principal.userId,
        filter: params.filter,
        search: params.search || undefined,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 200,
        todayRange,
      });
      return {
        items: items.map((t) => serializeTask(t, params.timezone, now)),
        total,
      };
    },

    async createTask(params: { userId: string; timezone: string }, data: CreateTaskInput): Promise<TaskDTO> {
      if (data.tagIds?.length) {
        const owned = await tagRepo.countOwned(params.userId, data.tagIds);
        if (owned !== data.tagIds.length) {
          throw new ForbiddenError("包含不属于你的标签");
        }
      }
      const dueAt = data.dueDate ? taskRepo.dueAtFromDateStr(data.dueDate, params.timezone) : null;
      const task = await taskRepo.create(params.userId, {
        title: data.title,
        description: data.description ? data.description : null,
        dueAt,
        priority: data.priority,
      });
      if (data.tagIds?.length) {
        await taskRepo.setTags(task.id, data.tagIds);
      }
      const full = await taskRepo.findById(params.userId, task.id);
      if (!full) throw new NotFoundError("任务不存在");
      return serializeTask(full, params.timezone);
    },

    async updateTask(params: { userId: string; timezone: string }, data: UpdateTaskInput): Promise<TaskDTO> {
      const existing = await taskRepo.findById(params.userId, data.id);
      if (!existing) throw new NotFoundError("任务不存在");

      if (data.tagIds) {
        if (data.tagIds.length) {
          const owned = await tagRepo.countOwned(params.userId, data.tagIds);
          if (owned !== data.tagIds.length) {
            throw new ForbiddenError("包含不属于你的标签");
          }
        }
        await taskRepo.setTags(data.id, data.tagIds);
      }

      const dueAt =
        data.dueDate === undefined
          ? undefined
          : data.dueDate
            ? taskRepo.dueAtFromDateStr(data.dueDate, params.timezone)
            : null;

      await taskRepo.update(params.userId, data.id, {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description ? data.description : null } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(dueAt !== undefined ? { dueAt } : {}),
      });

      const full = await taskRepo.findById(params.userId, data.id);
      if (!full) throw new NotFoundError("任务不存在");
      return serializeTask(full, params.timezone);
    },

    async toggleTask(params: { userId: string; timezone: string }, id: string, completed: boolean): Promise<TaskDTO> {
      const existing = await taskRepo.findById(params.userId, id);
      if (!existing) throw new NotFoundError("任务不存在");
      await taskRepo.update(params.userId, id, {
        completed,
        completedAt: completed ? new Date() : null,
      });
      const full = await taskRepo.findById(params.userId, id);
      if (!full) throw new NotFoundError("任务不存在");
      return serializeTask(full, params.timezone);
    },

    async deleteTask(params: { userId: string }, id: string): Promise<{ deleted: true }> {
      const existing = await taskRepo.findById(params.userId, id);
      if (!existing) throw new NotFoundError("任务不存在");
      await taskRepo.softDelete(params.userId, id);
      return { deleted: true };
    },

    async listTags(params: { userId: string | null; isGuest: boolean }) {
      if (params.isGuest || params.userId === null) {
        return GUEST_DEMO_TASKS.flatMap((t) => t.tags).filter(
          (tag, i, arr) => arr.findIndex((x) => x.id === tag.id) === i,
        );
      }
      return tagRepo.listByUser(params.userId);
    },

    async createTag(params: { userId: string }, name: string, color: string) {
      if (!name.trim()) throw new ValidationError({ name: ["请输入标签名"] });
      const existing = await tagRepo.findByNames(params.userId, [name.trim()]);
      if (existing.length > 0) return existing[0];
      return tagRepo.create(params.userId, { name: name.trim(), color });
    },

    /** “今天”的本地日期串（给客户端做本地过滤时对齐口径） */
    todayInTz(timezone: string, now = new Date()): string {
      return toLocalDateString(now, timezone);
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
