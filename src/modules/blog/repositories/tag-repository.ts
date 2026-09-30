import type { Prisma, TagScope } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

/**
 * 博客标签仓储（制作流程 Step 2.2）。
 *
 * **不提供任何无 scope 参数的方法** —— 从接口层面消除"忘记带 scope 导致任务标签混入博客"的可能
 * （PRD §4.2 约束 1 / A-07 / B-09）。
 *
 * 命名说明：本工厂刻意叫 `createBlogTagRepository`（而非 tasks 模块的 `createTagRepository`），
 * 二者作用域不同、互不导入，同名会造成阅读歧义。
 */

/** 标签调色板（与任务模块视觉语言一致；按名称取模，保证同名同色） */
export const BLOG_TAG_COLORS = [
  "#0EA5E9",
  "#8B5CF6",
  "#F97316",
  "#10B981",
  "#EF4444",
  "#6366F1",
  "#D946EF",
  "#14B8A6",
] as const;

/** 由标签名稳定地派生颜色（同名永远同色，便于视觉记忆） */
export function colorForTag(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 100000;
  return BLOG_TAG_COLORS[h % BLOG_TAG_COLORS.length] as string;
}

type Db = Prisma.TransactionClient;

export function createBlogTagRepository(db: Db = defaultPrisma) {
  /** 新建或复用一篇博文的标签（scope 硬编码 POST，杜绝误建到任务域） */
  async function upsertForPost(userId: string, name: string) {
    const trimmed = name.trim();
    const existing = await db.tag.findUnique({
      where: { userId_scope_name: { userId, scope: "POST", name: trimmed } },
      select: { id: true, name: true, color: true },
    });
    if (existing) return existing;
    return db.tag.create({
      data: { userId, scope: "POST", name: trimmed, color: colorForTag(trimmed) },
      select: { id: true, name: true, color: true },
    });
  }

  return {
    upsertForPost,

    /** 按作用域列出我的标签（scope 为必填参数，无默认值 —— 想漏都漏不掉） */
    listByScope(userId: string, scope: TagScope) {
      return db.tag.findMany({
        where: { userId, scope },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      });
    },

    /** 我的博客标签（显式锁定 POST 域） */
    listForPost(userId: string) {
      return db.tag.findMany({
        where: { userId, scope: "POST" },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      });
    },

    /** 批量确保标签存在（发布时一次性 upsert，返回去重后的标签列表） */
    async ensureForPost(userId: string, names: string[]) {
      const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
      const out: { id: string; name: string; color: string }[] = [];
      for (const name of unique) {
        out.push(await upsertForPost(userId, name));
      }
      return out;
    },

    /** 我的 POST 域标签计数（标签管理 / 标签云（作者视角）） */
    async listMineWithCounts(userId: string) {
      return db.tag.findMany({
        where: { userId, scope: "POST" },
        select: {
          id: true,
          name: true,
          color: true,
          _count: { select: { postLinks: { where: { post: { userId, deletedAt: null } } } } },
        },
        orderBy: { name: "asc" },
      });
    },

    /** 校验传入的标签 id 是否全部属于当前用户的 POST 域（发布时防越权挂他人标签） */
    async countOwnedPostTags(userId: string, tagIds: string[]): Promise<number> {
      if (tagIds.length === 0) return 0;
      return db.tag.count({ where: { id: { in: tagIds }, userId, scope: "POST" } });
    },

    /** 按名称查（POST 域，用于标签归档路由解析） */
    findByNames(userId: string, names: string[]) {
      return db.tag.findMany({
        where: { userId, scope: "POST", name: { in: names } },
        select: { id: true, name: true, color: true },
      });
    },
  };
}

export type BlogTagRepository = ReturnType<typeof createBlogTagRepository>;
