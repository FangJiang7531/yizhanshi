import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { assertSafeTargetUrl } from "@/modules/links/services/link.service";

/**
 * 书签服务：网站收藏 + 站内文章收藏。
 * 收藏夹（folder）/标签（数组）/星标/备注/归档/全文搜索（title+description+note+url 前缀匹配）。
 * 外部 URL 入库前过 SSRF 校验（复用短链模块的 assertSafeTargetUrl）。
 */

export type BookmarkDTO = {
  id: string;
  url: string;
  title: string;
  kind: "link" | "post";
  description: string | null;
  folder: string;
  tags: string[];
  isFavorite: boolean;
  note: string | null;
  createdAt: string;
  /** 站内文章收藏的跳转路径 */
  postPath: string | null;
};

type BookmarkRow = {
  id: string;
  url: string;
  title: string;
  kind: string;
  description: string | null;
  folder: string;
  tags: string[];
  isFavorite: boolean;
  note: string | null;
  createdAt: Date;
  postId: string | null;
  post?: { slug: string } | null;
};

function toDTO(row: BookmarkRow): BookmarkDTO {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    kind: row.kind === "post" ? "post" : "link",
    description: row.description,
    folder: row.folder,
    tags: row.tags,
    isFavorite: row.isFavorite,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    postPath: row.post?.slug ? `/blog/p/${row.post.slug}` : null,
  };
}

export function createBookmarkService(db: PrismaClient = defaultPrisma) {
  return {
    async create(userId: string, input: {
      url: string;
      title: string;
      kind?: "link" | "post";
      description?: string;
      folder?: string;
      tags?: string[];
      isFavorite?: boolean;
      note?: string;
      postId?: string;
    }): Promise<BookmarkDTO> {
      const url = assertSafeTargetUrl(input.url);
      // 同用户同 URL 幂等：重复收藏返回已存在记录
      const existing = await db.bookmark.findFirst({
        where: { userId, url },
        include: { post: { select: { slug: true } } },
      });
      if (existing) return toDTO(existing);

      // 站内文章收藏：校验文章存在且公开（postId 由 FK 保存，slug 在 DTO include 中取出）
      if (input.postId) {
        const post = await db.blogPost.findFirst({
          where: { id: input.postId, status: "PUBLISHED", visibility: "PUBLIC", deletedAt: null },
          select: { id: true },
        });
        if (!post) throw new NotFoundError("文章不存在或未公开");
      }

      const created = await db.bookmark.create({
        data: {
          userId,
          url,
          title: input.title.slice(0, 300),
          kind: input.postId ? "post" : (input.kind ?? "link"),
          description: input.description ?? null,
          folder: input.folder?.slice(0, 100) || "默认收藏",
          tags: input.tags ?? [],
          isFavorite: input.isFavorite ?? false,
          note: input.note ?? null,
          postId: input.postId ?? null,
        },
        include: { post: { select: { slug: true } } },
      });
      return toDTO(created);
    },

    /** 列表：收藏夹/标签/关键词/类型/星标 过滤 */
    async list(userId: string, filter: { folder?: string; tag?: string; q?: string; kind?: "link" | "post" | "all"; favoritesOnly?: boolean } = {}) {
      const q = filter.q?.trim();
      const rows = await db.bookmark.findMany({
        where: {
          userId,
          deletedAt: null,
          ...(filter.folder ? { folder: filter.folder } : {}),
          ...(filter.tag ? { tags: { has: filter.tag } } : {}),
          ...(filter.kind && filter.kind !== "all" ? { kind: filter.kind } : {}),
          ...(filter.favoritesOnly ? { isFavorite: true } : {}),
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: "insensitive" as const } },
                  { description: { contains: q, mode: "insensitive" as const } },
                  { note: { contains: q, mode: "insensitive" as const } },
                  { url: { contains: q, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        orderBy: [{ isFavorite: "desc" }, { createdAt: "desc" }],
        take: 200,
        include: { post: { select: { slug: true } } },
      });
      return rows.map(toDTO);
    },

    /** 收藏夹列表（侧栏分组） */
    async folders(userId: string) {
      const rows = await db.bookmark.groupBy({
        by: ["folder"],
        where: { userId, deletedAt: null },
        _count: { _all: true },
        orderBy: { folder: "asc" },
      });
      return rows.map((r) => ({ folder: r.folder, count: r._count._all }));
    },

    /** 全部标签（标签云） */
    async tags(userId: string) {
      const rows = await db.bookmark.findMany({
        where: { userId, deletedAt: null },
        select: { tags: true },
      });
      const counter = new Map<string, number>();
      for (const row of rows) {
        for (const t of row.tags) counter.set(t, (counter.get(t) ?? 0) + 1);
      }
      return Array.from(counter.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);
    },

    async update(userId: string, input: { id: string; title?: string; description?: string; folder?: string; tags?: string[]; isFavorite?: boolean; note?: string }) {
      const row = await db.bookmark.findFirst({ where: { id: input.id, userId }, select: { id: true } });
      if (!row) throw new NotFoundError("书签不存在");
      const updated = await db.bookmark.update({
        where: { id: input.id },
        data: {
          ...(input.title !== undefined ? { title: input.title.slice(0, 300) } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.folder !== undefined ? { folder: input.folder.slice(0, 100) || "默认收藏" } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(input.isFavorite !== undefined ? { isFavorite: input.isFavorite } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
        include: { post: { select: { slug: true } } },
      });
      return toDTO(updated);
    },

    /** 归档（软隐藏） */
    async archive(userId: string, id: string, archived: boolean) {
      const row = await db.bookmark.findFirst({ where: { id, userId }, select: { id: true } });
      if (!row) throw new NotFoundError("书签不存在");
      await db.bookmark.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
      return { archived };
    },

    async remove(userId: string, id: string) {
      const row = await db.bookmark.findFirst({ where: { id, userId }, select: { id: true } });
      if (!row) throw new NotFoundError("书签不存在");
      await db.bookmark.update({ where: { id }, data: { deletedAt: new Date() } });
      return { deleted: true as const };
    },

    /** 抓取网页 <title>（新建书签自动填标题；SSRF 校验 + 5s 超时 + 256KB 上限） */
    async fetchTitle(rawUrl: string): Promise<{ title: string | null }> {
      const url = assertSafeTargetUrl(rawUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": "personal-workbench-bookmark/1.0", Accept: "text/html" },
          redirect: "follow",
        });
        if (!res.ok) return { title: null };
        const reader = res.body?.getReader();
        if (!reader) return { title: null };
        // 只读前 256KB，防大文件
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (total < 256 * 1024) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          total += value.length;
          if (new TextDecoder().decode(concat(chunks)).includes("</title>")) break;
        }
        reader.cancel().catch(() => undefined);
        const html = new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks));
        const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
        return { title: m ? m[1]!.trim() : null };
      } catch {
        return { title: null };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export type BookmarkService = ReturnType<typeof createBookmarkService>;
