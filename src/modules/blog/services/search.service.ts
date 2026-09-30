import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { createPostRepository, type PostRepository } from "../repositories/post.repository";
import { serializeSearchHit, serializeTagCloud } from "./dto";
import type { SearchHitDTO, SearchResultDTO, TagCloudItemDTO } from "../types";

/**
 * 全文搜索（PRD §5.7 / 制作流程 Step 3.4）。
 *
 * 抽象出 `SearchProvider` 接口的原因：本期用 PostgreSQL `pg_trgm + GIN` 就够，
 * 但搜索是典型的"随时可能换引擎"的能力（Meilisearch / Typesense）。
 * 把实现藏在接口后面，将来换引擎只需新增一个 Provider，服务层与页面零改动。
 *
 * 为什么不用 tsvector：PG 默认分词器不切中文，整句会被当成一个词元；
 * pg_trgm 按字符三元组切分，零额外部署成本即可支持中文。
 */

export type SearchHitRaw = {
  items: SearchHitDTO[];
  nextCursor: string | null;
};

export interface SearchProvider {
  search(q: string, opts: { cursor?: string; take: number }): Promise<SearchHitRaw>;
}

/** HTML 转义：搜索片段会以 dangerouslySetInnerHTML 渲染高亮，必须先转义再插 <mark> */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 压缩空白：Markdown 正文里的换行在摘要中应表现为空格 */
function squeeze(input: string): string {
  return input.replace(/\s+/g, " ");
}

/**
 * 构造命中片段：命中词前后各 40 字，命中词包 `<mark>`。
 * 截断处补省略号；结果已整体转义，只有 `<mark>` 是我们自己插入的。
 */
export function buildSnippet(text: string, q: string, radius = 40): string | null {
  if (!text || !q) return null;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  const before = squeeze(text.slice(start, idx));
  const hit = squeeze(text.slice(idx, idx + q.length));
  const after = squeeze(text.slice(idx + q.length, end));
  return `${start > 0 ? "…" : ""}${escapeHtml(before)}<mark>${escapeHtml(hit)}</mark>${escapeHtml(after)}${
    end < text.length ? "…" : ""
  }`;
}

/**
 * 标题高亮（PRD A-14：命中标题/摘要/正文/标签并高亮）。
 * 标题短，全部命中词都标；先整体转义再插 `<mark>`，与 buildSnippet 同一安全口径。
 * `q` 中的正则元字符先转义，避免把用户输入当模式解释。
 */
export function highlightTitle(title: string, q: string): string {
  if (!title || !q) return escapeHtml(title);
  const escaped = escapeHtml(title);
  const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return escaped.replace(new RegExp(pattern, "gi"), (m) => `<mark>${m}</mark>`);
  } catch {
    return escaped;
  }
}

/**
 * PostgreSQL pg_trgm 适配器。
 * 过滤口径由仓储层保证（PUBLISHED + PUBLIC + PASSED + deletedAt IS NULL），
 * 这里只负责"选字段做摘要 + 拼高亮"，不重复实现可见性判断。
 */
export class PostgresTrgmSearchProvider implements SearchProvider {
  constructor(private readonly postRepo: PostRepository) {}

  async search(q: string, opts: { cursor?: string; take: number }): Promise<SearchHitRaw> {
    const { items, nextCursor } = await this.postRepo.searchPublic(q, opts);
    return {
      items: items.map((post) =>
        serializeSearchHit(
          post,
          buildSnippet(post.excerpt || post.contentMd, q),
          highlightTitle(post.title, q),
        ),
      ),
      nextCursor,
    };
  }
}

export function createSearchService(
  db: PrismaClient = defaultPrisma,
  postRepo: PostRepository = createPostRepository(db),
) {
  const provider: SearchProvider = new PostgresTrgmSearchProvider(postRepo);

  return {
    /** 暴露 provider 便于将来替换（或测试注入 FakeProvider） */
    provider,

    async search(q: string, opts: { cursor?: string; take: number }): Promise<SearchResultDTO> {
      const trimmed = q.trim();
      // 触发条件：输入 ≥2 字符（PRD §5.7）；不足则返回空结果而非报错（前端已有防抖）
      if (trimmed.length < 2) return { q: trimmed, items: [], nextCursor: null };
      const { items, nextCursor } = await provider.search(trimmed, opts);
      return { q: trimmed, items, nextCursor };
    },

    /** 搜索空状态推荐的"热门标签"（按公开文章数倒序） */
    async popularTags(take = 8): Promise<TagCloudItemDTO[]> {
      const rows = await postRepo.listPublicTags();
      return serializeTagCloud(rows)
        .sort((a, b) => b.postCount - a.postCount)
        .slice(0, take);
    },
  };
}

export type SearchService = ReturnType<typeof createSearchService>;
