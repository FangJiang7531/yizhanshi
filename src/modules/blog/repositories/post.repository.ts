import type { PostStatus, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import type { ListMineQuery, PublicListQuery } from "../types";

/**
 * 文章仓储层（制作流程 Step 2.1）。
 *
 * 数据隔离纪律（与 tasks 模块同构，但博客多出一个公开域）：
 * - **作者域**：所有方法第一个参数必须是 userId，`where` 一律带 userId + deletedAt: null；
 * - **公开域**：所有方法名以 Public 结尾，`where` 一律带四个条件
 *   `status / auditStatus / visibility / deletedAt`（Gate 2.1 判据 1）；
 * - 更新走 `updateMany`，把归属校验下推到 SQL 的 WHERE，消除"校验与写入之间的竞态窗口"。
 */

/** 公开列表域：只有「已发布 + 审核通过 + 公开」才进入列表/聚合位（PRD §3.2） */
const PUBLIC_LISTABLE: Prisma.BlogPostWhereInput = {
  deletedAt: null,
  status: "PUBLISHED",
  auditStatus: "PASSED",
  visibility: "PUBLIC",
};

/**
 * 公开直达域：UNLISTED（不推广，被链接到就正常展示）也可直达，但先决条件相同。
 * 四条件一个都不能少——这是防"草稿被爬虫抓走"的结构性保障。
 */
const PUBLIC_REACHABLE: Prisma.BlogPostWhereInput = {
  deletedAt: null,
  status: "PUBLISHED",
  auditStatus: "PASSED",
  visibility: { in: ["PUBLIC", "UNLISTED"] },
};

/** 作者域基准条件 */
function mineWhere(userId: string): Prisma.BlogPostWhereInput {
  return { userId, deletedAt: null };
}

const AUTHOR_SELECT = {
  select: { id: true, username: true, displayName: true, avatarUrl: true },
} satisfies Prisma.BlogPostInclude["user"];

const LIST_INCLUDE = {
  user: AUTHOR_SELECT,
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
} satisfies Prisma.BlogPostInclude;

/** 作者列表/详情附带统计所需的标签 */
const DETAIL_INCLUDE = LIST_INCLUDE satisfies Prisma.BlogPostInclude;

/**
 * 客户端类型取 `Prisma.TransactionClient`：它既接受 PrismaClient，
 * 也接受 `$transaction(async (tx) => …)` 里的事务客户端。
 * 这样服务层可以把仓储直接搬进事务内组合（发布流程需要），而不必为每个仓储写两份。
 */
type Db = Prisma.TransactionClient;

export function createPostRepository(db: Db = defaultPrisma) {
  return {
    // ─────────────────────────── 作者域（强制 userId）───────────────────────────

    /** 按 id 查我的文章（他人 postId 返回 null → 服务层抛 404，不泄漏存在性，C-01/C-02） */
    findMineById(userId: string, id: string) {
      return db.blogPost.findFirst({ where: { id, ...mineWhere(userId) }, include: DETAIL_INCLUDE });
    },

    /** 按 slug 查我的文章（含草稿/私密；供作者直达预览） */
    findMineBySlug(userId: string, slug: string) {
      return db.blogPost.findFirst({ where: { slug, ...mineWhere(userId) }, include: DETAIL_INCLUDE });
    },

    /** 我的文章列表（含草稿；按状态标签页 + 关键词 + 游标分页） */
    async listMine(userId: string, opts: ListMineQuery) {
      const where: Prisma.BlogPostWhereInput = mineWhere(userId);
      if (opts.status) where.status = opts.status;
      if (opts.q) {
        where.OR = [
          { title: { contains: opts.q, mode: "insensitive" } },
          { excerpt: { contains: opts.q, mode: "insensitive" } },
        ];
      }
      const take = opts.take;
      const items = await db.blogPost.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      });
      const hasMore = items.length > take;
      const page = hasMore ? items.slice(0, take) : items;
      return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
    },

    /** 各状态计数（/blog/me 页头统计条） */
    async countMineByStatus(userId: string) {
      const grouped = await db.blogPost.groupBy({
        by: ["status"],
        where: mineWhere(userId),
        _count: { _all: true },
      });
      const counts: Record<PostStatus, number> = { DRAFT: 0, REVIEW: 0, PUBLISHED: 0, ARCHIVED: 0 };
      for (const row of grouped) counts[row.status] = row._count._all;
      return counts;
    },

    /** 我的总阅读量（页头统计） */
    async sumMineViews(userId: string): Promise<number> {
      const agg = await db.blogPost.aggregate({ where: mineWhere(userId), _sum: { viewCount: true } });
      return agg._sum.viewCount ?? 0;
    },

    create(
      userId: string,
      data: {
        slug: string;
        title: string;
        contentMd: string;
        excerpt?: string | null;
        visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE";
      },
    ) {
      return db.blogPost.create({
        data: {
          userId,
          slug: data.slug,
          title: data.title,
          contentMd: data.contentMd,
          excerpt: data.excerpt ?? null,
          ...(data.visibility ? { visibility: data.visibility } : {}),
        },
        include: DETAIL_INCLUDE,
      });
    },

    /**
     * 更新我的文章。用 updateMany 而非 update：
     * update 需要唯一条件，若先 findFirst 校验归属再 update({ where: { id } })，
     * 会留下"校验与写入之间的竞态窗口"。updateMany 把 userId 校验下推到 SQL WHERE。
     */
    updateMine(userId: string, id: string, data: Prisma.BlogPostUpdateManyMutationInput) {
      return db.blogPost.updateMany({ where: { id, ...mineWhere(userId) }, data });
    },

    /** 软删除（进回收站；列表与公开域均由 deletedAt 过滤） */
    softDeleteMine(userId: string, id: string) {
      return db.blogPost.updateMany({ where: { id, ...mineWhere(userId) }, data: { deletedAt: new Date() } });
    },

    /** 改 slug：需要唯一性兜底，先按 id+userId 定位再写（唯一索引是最终防线） */
    async updateSlugMine(userId: string, id: string, slug: string) {
      const res = await db.blogPost.updateMany({ where: { id, ...mineWhere(userId) }, data: { slug } });
      return res.count;
    },

    /** slug 是否已被占用（跨用户全局唯一；excludeId 用于"改自己的文章不改 slug"） */
    findSlugOwner(slug: string, excludeId?: string) {
      return db.blogPost.findFirst({
        where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { id: true, userId: true },
      });
    },

    /**
     * 清空文章标签关联。与 addTags 配对使用，两步都在服务层的同一事务内执行
     * （此处不合并成一个方法，是为了让"替换"这一语义留在服务层，仓储只做原子数据访问）。
     */
    clearTags(postId: string) {
      return db.postTag.deleteMany({ where: { postId } });
    },

    /** 批量写入文章标签关联 */
    addTags(postId: string, tagIds: string[]) {
      if (tagIds.length === 0) return Promise.resolve({ count: 0 });
      return db.postTag.createMany({ data: tagIds.map((tagId) => ({ postId, tagId })) });
    },

    // ─────────────────────────── 公开域（强制四条件）───────────────────────────

    /** 公开直达：按 slug 查（列表位与直达位的差别只在调用方选哪个常量） */
    findPublicBySlug(slug: string) {
      return db.blogPost.findFirst({ where: { slug, ...PUBLIC_REACHABLE }, include: DETAIL_INCLUDE });
    },

    /** 公开可访问：按 id 查（评论创建前校验文章可访问） */
    findPublicById(id: string) {
      return db.blogPost.findFirst({
        where: { id, ...PUBLIC_REACHABLE },
        select: { id: true, userId: true, slug: true, allowComment: true, allowRepost: true },
      });
    },

    /** 公开列表：latest（发布时间倒序）/ hot（点赞倒序），游标分页 */
    async listPublic(opts: PublicListQuery) {
      const take = opts.take;
      const items = await db.blogPost.findMany({
        where: PUBLIC_LISTABLE,
        include: LIST_INCLUDE,
        orderBy:
          opts.tab === "hot"
            ? [{ likeCount: "desc" }, { viewCount: "desc" }, { id: "desc" }]
            : [{ publishedAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      });
      const hasMore = items.length > take;
      const page = hasMore ? items.slice(0, take) : items;
      return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
    },

    /** 作者主页：某用户的公开文章（UNLISTED 不进作者列表，与 PRD §3.2 一致） */
    async listPublicByAuthor(username: string, opts: { cursor?: string; take: number }) {
      const take = opts.take;
      const items = await db.blogPost.findMany({
        where: { ...PUBLIC_LISTABLE, user: { username } },
        include: LIST_INCLUDE,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      });
      const hasMore = items.length > take;
      const page = hasMore ? items.slice(0, take) : items;
      return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
    },

    /** 标签归档：按标签名（POST 域）取公开文章 */
    async listPublicByTag(tagName: string, opts: { cursor?: string; take: number }) {
      const take = opts.take;
      const items = await db.blogPost.findMany({
        where: { ...PUBLIC_LISTABLE, tags: { some: { tag: { name: tagName, scope: "POST" } } } },
        include: LIST_INCLUDE,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      });
      const hasMore = items.length > take;
      const page = hasMore ? items.slice(0, take) : items;
      return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
    },

    /** 标签云：公开文章的标签聚合（含文章数） */
    async listPublicTags(take = 50) {
      return db.tag.findMany({
        where: {
          scope: "POST",
          postLinks: { some: { post: PUBLIC_LISTABLE } },
        },
        select: {
          id: true,
          name: true,
          color: true,
          _count: { select: { postLinks: { where: { post: PUBLIC_LISTABLE } } } },
        },
        orderBy: { name: "asc" },
        take,
      });
    },

    /** 相关文章：基于标签推荐（同标签、排除自身、公开域） */
    async listRelated(postId: string, tagIds: string[], take = 3) {
      if (tagIds.length === 0) return [];
      return db.blogPost.findMany({
        where: {
          ...PUBLIC_LISTABLE,
          id: { not: postId },
          tags: { some: { tagId: { in: tagIds } } },
        },
        include: LIST_INCLUDE,
        orderBy: [{ publishedAt: "desc" }],
        take,
      });
    },

    /** 上一篇 / 下一篇（按发布时间邻接，公开列表域） */
    async findAdjacent(post: { id: string; publishedAt: Date | null }) {
      if (!post.publishedAt) return { prev: null, next: null };
      const [prev, next] = await Promise.all([
        db.blogPost.findFirst({
          where: { ...PUBLIC_LISTABLE, publishedAt: { lt: post.publishedAt }, id: { not: post.id } },
          select: { slug: true, title: true },
          orderBy: { publishedAt: "desc" },
        }),
        db.blogPost.findFirst({
          where: { ...PUBLIC_LISTABLE, publishedAt: { gt: post.publishedAt }, id: { not: post.id } },
          select: { slug: true, title: true },
          orderBy: { publishedAt: "asc" },
        }),
      ]);
      return { prev: prev ?? null, next: next ?? null };
    },

    /**
     * 全文搜索（pg_trgm + GIN 表达式索引，中文友好）。
     * 过滤：PUBLISHED + PUBLIC + PASSED + deletedAt IS NULL（PRD §5.7，UNLISTED 不参与搜索）。
     * 排序：标题命中权重 > 摘要 > 正文/标签名，同权重按发布时间倒序。
     * 标签名参与匹配 → 用 EXISTS 子查询，避免 JOIN 造成行重复。
     */
    async searchPublic(q: string, opts: { cursor?: string; take: number }) {
      const take = opts.take;
      const rows = await db.blogPost.findMany({
        where: {
          ...PUBLIC_LISTABLE,
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { excerpt: { contains: q, mode: "insensitive" } },
            { contentMd: { contains: q, mode: "insensitive" } },
            { tags: { some: { tag: { name: { contains: q, mode: "insensitive" }, scope: "POST" } } } },
          ],
          ...(opts.cursor ? { id: { not: opts.cursor } } : {}),
        },
        include: LIST_INCLUDE,
        take: take + 1,
      });
      // 权重排序在应用层完成（命中位置权重：标题 3 / 摘要 2 / 正文或标签 1），
      // 保证同权重按发布时间倒序稳定。数据量级别下（个人博客）开销可忽略。
      const lower = q.toLowerCase();
      const scored = rows.map((p) => {
        const inTitle = p.title.toLowerCase().includes(lower);
        const inExcerpt = (p.excerpt ?? "").toLowerCase().includes(lower);
        const weight = inTitle ? 3 : inExcerpt ? 2 : 1;
        return { post: p, weight };
      });
      scored.sort(
        (a, b) =>
          b.weight - a.weight ||
          (b.post.publishedAt?.getTime() ?? 0) - (a.post.publishedAt?.getTime() ?? 0) ||
          (a.post.id < b.post.id ? 1 : -1),
      );
      const hasMore = scored.length > take;
      const page = (hasMore ? scored.slice(0, take) : scored).map((s) => s.post);
      return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
    },

    /** 作者公开统计（作者主页页头：文章数 / 总阅读 / 总点赞） */
    async authorPublicStats(username: string) {
      const agg = await db.blogPost.aggregate({
        where: { ...PUBLIC_LISTABLE, user: { username } },
        _count: { _all: true },
        _sum: { viewCount: true, likeCount: true },
      });
      return {
        postCount: agg._count._all,
        totalViews: agg._sum.viewCount ?? 0,
        totalLikes: agg._sum.likeCount ?? 0,
      };
    },

    /** 站点地图用：全部公开文章的最小字段集（PUBLIC 才进 sitemap） */
    listSitemapEntries() {
      return db.blogPost.findMany({
        where: PUBLIC_LISTABLE,
        select: { slug: true, updatedAt: true, publishedAt: true },
        orderBy: { publishedAt: "desc" },
      });
    },

    /** RSS 用：最新 N 篇公开文章（UNLISTED 不进 feed） */
    listFeed(take: number) {
      return db.blogPost.findMany({
        where: PUBLIC_LISTABLE,
        include: LIST_INCLUDE,
        orderBy: { publishedAt: "desc" },
        take,
      });
    },

    /** 作者 RSS */
    listFeedByAuthor(username: string, take: number) {
      return db.blogPost.findMany({
        where: { ...PUBLIC_LISTABLE, user: { username } },
        include: LIST_INCLUDE,
        orderBy: { publishedAt: "desc" },
        take,
      });
    },

    /** 待审队列（ADMIN）：REVIEW 状态且未删除 */
    listModerationQueue(take = 50) {
      return db.blogPost.findMany({
        where: { deletedAt: null, status: "REVIEW" },
        include: DETAIL_INCLUDE,
        orderBy: { updatedAt: "asc" },
        take,
      });
    },

    /** 曝光常量供测试断言结构（Gate 2.1 用：确保四条件不被误删） */
    _whereFragments: { PUBLIC_LISTABLE, PUBLIC_REACHABLE },
  };
}

export type PostRepository = ReturnType<typeof createPostRepository>;
