import { Prisma, type PostStatus, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { ConflictError, ContentRejectedError, NotFoundError, PostNotAccessibleError, SlugConflictError } from "@/lib/errors";
import { createPostRepository, type PostRepository } from "../repositories/post.repository";
import { createBlogTagRepository, type BlogTagRepository } from "../repositories/tag-repository";
import { renderMarkdown } from "../lib/markdown";
import { calcStats } from "../lib/stats";
import { ensureUniqueSlug, isValidSlug, slugify } from "../lib/slug";
import { auditFields, blockHits, type HitWithField } from "./audit.service";
import { retryOnWriteConflict } from "./counter.service";
import { serializePostDetail, serializePostForEdit, serializePostListItem, serializeTagCloud } from "./dto";
import {
  publishPostSchema,
  saveDraftSchema,
  type PublishPostInput,
  type SaveDraftInput,
} from "../schemas";
import type {
  ListMineQuery,
  MineStatsDTO,
  PostDetailDTO,
  PostEditDTO,
  PostListItemDTO,
  PostViewResult,
  PublicListQuery,
  TagCloudItemDTO,
} from "../types";

/**
 * 文章服务层（制作流程 Step 3.1–3.3）。
 *
 * 纪律（与阶段一 task-service 一致）：签名不含任何 HTTP/框架上下文，
 * 也不调用 `revalidatePath` —— 缓存失效属于控制器（Server Action）职责，
 * 服务层保持可在纯 Node 环境（含集成测试）直接调用。
 */

export type ViewerContext = {
  userId: string | null;
  isAdmin?: boolean;
};

export type PublishResult = {
  post: PostEditDTO;
  status: PostStatus;
  auditStatus: "PENDING" | "PASSED" | "REJECTED";
  hits: HitWithField[];
};

/** 判断草稿保存是否与库中版本冲突（A-04：双标签页编辑不静默覆盖） */
function assertNoConflict(baseUpdatedAt: string | undefined, current: Date): void {
  if (!baseUpdatedAt) return;
  if (current.toISOString() !== baseUpdatedAt) {
    throw new ConflictError("这篇文章已在另一个窗口被修改，请刷新后再编辑（已阻止静默覆盖）");
  }
}

export function createPostService(
  db: PrismaClient = defaultPrisma,
  postRepo: PostRepository = createPostRepository(db),
  tagRepo: BlogTagRepository = createBlogTagRepository(db),
) {
  /** 把审核命中的字段文案统一组装给前端 */
  function auditTargets(data: {
    title: string;
    excerpt?: string | null;
    contentMd: string;
    tagNames: string[];
  }) {
    return [
      { field: "title", text: data.title },
      { field: "excerpt", text: data.excerpt ?? "" },
      { field: "content", text: data.contentMd },
      ...data.tagNames.map((n, i) => ({ field: `tag[${i}]`, text: n })),
    ];
  }

  return {
    // ─────────────────────────── 创作侧 ───────────────────────────

    /** 我的文章列表（含草稿/待审/归档） */
    async listMine(userId: string, query: ListMineQuery) {
      const { items, nextCursor } = await postRepo.listMine(userId, query);
      return {
        items: items.map(serializePostListItem),
        nextCursor,
      };
    },

    /** /blog/me 页头统计：草稿 N / 待审 N / 已发布 N / 已归档 N + 总阅读 */
    async mineStats(userId: string): Promise<MineStatsDTO> {
      const [counts, totalViews] = await Promise.all([
        postRepo.countMineByStatus(userId),
        postRepo.sumMineViews(userId),
      ]);
      return {
        draft: counts.DRAFT,
        review: counts.REVIEW,
        published: counts.PUBLISHED,
        archived: counts.ARCHIVED,
        totalViews,
      };
    },

    /** 新建空白草稿（编辑器首屏用；标题留空，slug 走时间戳策略） */
    async createDraft(userId: string): Promise<PostEditDTO> {
      const slug = await ensureUniqueSlug(slugify("", Date.now()), undefined, db);
      const post = await postRepo.create(userId, { slug, title: "", contentMd: "" });
      return serializePostForEdit(post);
    },

    /**
     * 保存草稿（自动保存 / 手动保存共用）。
     *
     * 审核策略（PRD §6.2）：BLOCK 直接拒绝写入；MASK 自动替换后放行；
     * REVIEW 仅记录命中、不改状态（草稿仍是草稿），待发布时转待审。
     */
    async saveDraft(userId: string, rawInput: SaveDraftInput) {
      const input = saveDraftSchema.parse(rawInput);

      const audit = await auditFields(
        auditTargets({
          title: input.title,
          excerpt: input.excerpt || null,
          contentMd: input.contentMd,
          tagNames: input.tagNames,
        }),
      );
      if (audit.blocked) throw new ContentRejectedError(blockHits(audit));

      // MASK 替换后的文本才落库
      const title = audit.masked.get("title") ?? input.title;
      const excerpt = audit.masked.get("excerpt") || null;
      const contentMd = audit.masked.get("content") ?? input.contentMd;

      let postId = input.id ?? null;

      if (postId) {
        const existing = await postRepo.findMineById(userId, postId);
        if (!existing) throw new PostNotAccessibleError();
        assertNoConflict(input.baseUpdatedAt, existing.updatedAt);
      } else {
        const slug = await ensureUniqueSlug(slugify(title, Date.now()), undefined, db);
        const created = await postRepo.create(userId, { slug, title, contentMd, excerpt });
        postId = created.id;
      }

      const stats = calcStats(contentMd);
      await postRepo.updateMine(userId, postId, {
        title,
        excerpt,
        contentMd,
        coverImage: input.coverImage || null,
        seoTitle: input.seoTitle || null,
        seoDesc: input.seoDesc || null,
        ogImage: input.ogImage || null,
        visibility: input.visibility,
        allowComment: input.allowComment,
        allowRepost: input.allowRepost,
        wordCount: stats.wordCount,
        readingMinutes: stats.readingMinutes,
      });

      // 标签：替换式写入（草稿也允许先挂标签）
      const tags = input.tagNames.length ? await tagRepo.ensureForPost(userId, input.tagNames) : [];
      await postRepo.clearTags(postId);
      if (tags.length) await postRepo.addTags(postId, tags.map((t) => t.id));

      const full = await postRepo.findMineById(userId, postId);
      if (!full) throw new NotFoundError("文章不存在");
      return { post: serializePostForEdit(full), hits: audit.hits };
    },

    /**
     * 发布（制作流程 Step 3.3）。
     * ① 归属校验 ② 字段校验 ③ 内容审核 ④ 渲染与派生字段 ⑤ 事务写入
     * （⑥ 缓存失效由 Action 层在拿到返回值后执行）
     */
    async publish(userId: string, rawInput: PublishPostInput): Promise<PublishResult> {
      const input = publishPostSchema.parse(rawInput);

      // ① 归属校验：他人文章 → 404 语义（C-02）
      const post = await postRepo.findMineById(userId, input.id);
      if (!post) throw new PostNotAccessibleError();
      assertNoConflict(input.baseUpdatedAt, post.updatedAt);

      // ③ 内容审核：标题 + 摘要 + 正文 + 标签名
      const audit = await auditFields(
        auditTargets({
          title: input.title,
          excerpt: input.excerpt || null,
          contentMd: input.contentMd,
          tagNames: input.tagNames,
        }),
      );
      if (audit.blocked) throw new ContentRejectedError(blockHits(audit));

      const title = audit.masked.get("title") ?? input.title;
      const excerpt = audit.masked.get("excerpt") || null;
      const contentMd = audit.masked.get("content") ?? input.contentMd;

      // 审核门禁：只有 PASSED 才能 PUBLISHED（PRD §6.4 状态机）
      const hasReview = audit.hasReview;
      const status: PostStatus = hasReview ? "REVIEW" : "PUBLISHED";
      const auditStatus = hasReview ? "PENDING" : "PASSED";

      // ④ slug：改标题不自动改 slug（B-03）；显式指定时才更新并校验唯一
      let slug = post.slug;
      if (input.slug && input.slug !== post.slug) {
        const owner = await postRepo.findSlugOwner(input.slug, post.id);
        if (owner) throw new SlugConflictError();
        slug = input.slug;
      }

      // ⑤ 渲染 HTML + 派生字段（目录随 HTML 一并固化，详情页不必重解析 Markdown）
      const { html, toc } = await renderMarkdown(contentMd);
      const stats = calcStats(contentMd);

      // ⑥ 事务写入：标签 + 审核流水 + 文章主体
      const updatedId = await retryOnWriteConflict(() =>
        db.$transaction(async (tx) => {
          const txPost = createPostRepository(tx);
          const txTag = createBlogTagRepository(tx);

          const tags = input.tagNames.length ? await txTag.ensureForPost(userId, input.tagNames) : [];
          await txPost.clearTags(input.id);
          if (tags.length) await txPost.addTags(input.id, tags.map((t) => t.id));

          await tx.auditRecord.create({
            data: {
              targetType: "POST",
              targetId: input.id,
              action: hasReview ? "SUBMIT" : "PASS",
              matchedWords: audit.hits.length ? (audit.hits as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            },
          });

          await txPost.updateMine(userId, input.id, {
            title,
            excerpt,
            contentMd,
            contentHtml: html,
            toc: toc as unknown as Prisma.InputJsonValue,
            coverImage: input.coverImage || null,
            seoTitle: input.seoTitle || null,
            seoDesc: input.seoDesc || null,
            ogImage: input.ogImage || null,
            visibility: input.visibility,
            allowComment: input.allowComment,
            allowRepost: input.allowRepost,
            slug,
            wordCount: stats.wordCount,
            readingMinutes: stats.readingMinutes,
            status,
            auditStatus,
            // 首次发布才设置 publishedAt；重复发布同一篇不更新（B-02）
            publishedAt: post.publishedAt ?? new Date(),
          });

          return input.id;
        }),
      );

      const full = await postRepo.findMineById(userId, updatedId);
      if (!full) throw new NotFoundError("文章不存在");
      return { post: serializePostForEdit(full), status, auditStatus, hits: audit.hits };
    },

    /** 归档（从公开域消失；作者仍可见） */
    async archive(userId: string, id: string): Promise<PostEditDTO> {
      const post = await postRepo.findMineById(userId, id);
      if (!post) throw new PostNotAccessibleError();
      await postRepo.updateMine(userId, id, { status: "ARCHIVED" });
      const full = await postRepo.findMineById(userId, id);
      if (!full) throw new NotFoundError("文章不存在");
      return serializePostForEdit(full);
    },

    /** 取消归档：回到草稿态（避免直接复活为已发布而绕过审核） */
    async unarchive(userId: string, id: string): Promise<PostEditDTO> {
      const post = await postRepo.findMineById(userId, id);
      if (!post) throw new PostNotAccessibleError();
      await postRepo.updateMine(userId, id, { status: "DRAFT" });
      const full = await postRepo.findMineById(userId, id);
      if (!full) throw new NotFoundError("文章不存在");
      return serializePostForEdit(full);
    },

    /** 软删除 */
    async softDelete(userId: string, id: string): Promise<{ deleted: true }> {
      const res = await postRepo.softDeleteMine(userId, id);
      if (res.count === 0) throw new PostNotAccessibleError();
      return { deleted: true };
    },

    /**
     * 显式更新链接标识（B-03：改标题不自动改 slug，此操作单独确认）。
     * 返回旧 slug，供 Action 层同时失效新旧两条路径的缓存。
     */
    async updateSlug(userId: string, id: string, slug: string): Promise<{ oldSlug: string; newSlug: string }> {
      if (!isValidSlug(slug)) throw new SlugConflictError("链接标识仅允许小写字母、数字与连字符，长度 3–80");
      const post = await postRepo.findMineById(userId, id);
      if (!post) throw new PostNotAccessibleError();
      const owner = await postRepo.findSlugOwner(slug, id);
      if (owner) throw new SlugConflictError();
      await postRepo.updateSlugMine(userId, id, slug);
      return { oldSlug: post.slug, newSlug: slug };
    },

    /** 作者编辑页：按 id 取（仅作者本人；管理员也需显式拥有该文才可编辑） */
    async getForEdit(userId: string, id: string): Promise<PostEditDTO> {
      const post = await postRepo.findMineById(userId, id);
      if (!post) throw new PostNotAccessibleError();
      // 预览用的 HTML：懒渲染（草稿可能从未渲染过）
      if (!post.contentHtml && post.contentMd) {
        const { html, toc } = await renderMarkdown(post.contentMd);
        await postRepo.updateMine(userId, id, {
          contentHtml: html,
          toc: toc as unknown as Prisma.InputJsonValue,
        });
        post.contentHtml = html;
        post.toc = toc as unknown as Prisma.JsonValue;
      }
      return serializePostForEdit(post);
    },

    // ─────────────────────────── 消费侧 ───────────────────────────

    /** 公开文章列表（发现页） */
    async listPublic(query: PublicListQuery) {
      const { items, nextCursor } = await postRepo.listPublic(query);
      return { items: items.map(serializePostListItem), nextCursor };
    },

    /** 标签云（发现页 + 标签总览） */
    async listPublicTags(): Promise<TagCloudItemDTO[]> {
      const rows = await postRepo.listPublicTags();
      return serializeTagCloud(rows);
    },

    /**
     * 详情页预渲染候选集（`generateStaticParams`）。
     * 最近 100 篇 + 热门 50 篇，按 slug 去重 —— 同一篇可能同时落进两路。
     */
    async listStaticParams(): Promise<{ slug: string }[]> {
      const rows = await postRepo.listTopForStatic(100, 50);
      const seen = new Set<string>();
      const out: { slug: string }[] = [];
      for (const row of rows) {
        if (seen.has(row.slug)) continue;
        seen.add(row.slug);
        out.push({ slug: row.slug });
      }
      return out;
    },

    /** 作者主页预渲染候选集 */
    async listAuthorStaticParams(): Promise<{ username: string }[]> {
      const names = await postRepo.listActiveAuthorUsernames(100);
      return names.map((username) => ({ username }));
    },

    /** 标签归档预渲染候选集 */
    async listTagStaticParams(): Promise<{ tag: string }[]> {
      const names = await postRepo.listActiveTagNames(100);
      return names.map((tag) => ({ tag }));
    },

    /**
     * 按 slug 取文章详情（Gate 3.1）。
     *
     * 可见性矩阵：
     * - 公开域命中（PUBLISHED + PASSED + PUBLIC|UNLISTED）→ 公众视角；
     * - 未命中且访问者是作者本人 → 作者视角（含草稿/待审/驳回/私密/归档），canEdit = true；
     * - 其余一律 PostNotAccessibleError（404 语义，**不是 403**，不泄漏"存在但无权"）。
     */
    async getBySlug(slug: string, viewer: ViewerContext): Promise<PostViewResult> {
      const publicPost = await postRepo.findPublicBySlug(slug);
      if (publicPost) {
        const isAuthor = viewer.userId !== null && viewer.userId === publicPost.userId;
        return {
          post: serializePostDetail(publicPost),
          isAuthor,
          canEdit: isAuthor,
          isAuthorView: false,
        };
      }

      if (viewer.userId) {
        const mine = await postRepo.findMineBySlug(viewer.userId, slug);
        if (mine) {
          return {
            post: serializePostForEdit(mine),
            isAuthor: true,
            canEdit: true,
            isAuthorView: true,
          };
        }
      }

      throw new PostNotAccessibleError();
    },

    /** 相关文章（基于标签推荐，最多 3 篇） */
    async listRelated(postId: string, tagIds: string[]): Promise<PostListItemDTO[]> {
      const rows = await postRepo.listRelated(postId, tagIds, 3);
      return rows.map(serializePostListItem);
    },

    /** 上一篇 / 下一篇 */
    getAdjacent(post: { id: string; publishedAt: string | null }) {
      return postRepo.findAdjacent({ id: post.id, publishedAt: post.publishedAt ? new Date(post.publishedAt) : null });
    },

    /** 作者主页 */
    async listByAuthor(username: string, query: { cursor?: string; take: number }) {
      const [{ items, nextCursor }, stats] = await Promise.all([
        postRepo.listPublicByAuthor(username, query),
        postRepo.authorPublicStats(username),
      ]);
      return { items: items.map(serializePostListItem), nextCursor, stats };
    },

    /** 标签归档 */
    async listByTag(tagName: string, query: { cursor?: string; take: number }) {
      const { items, nextCursor } = await postRepo.listPublicByTag(tagName, query);
      return { items: items.map(serializePostListItem), nextCursor };
    },

    // ─────────────────────────── 审核队列（ADMIN）───────────────────────────

    async listModerationQueue(): Promise<PostDetailDTO[]> {
      const rows = await postRepo.listModerationQueue();
      return rows.map(serializePostDetail);
    },

    /** 人工复核：通过 → PUBLISHED + PASSED；驳回 → REVIEW 保持但标注 REJECTED + 意见 */
    async moderate(adminId: string, input: { id: string; action: "APPROVE" | "REJECT"; note?: string }) {
      const post = await db.blogPost.findFirst({ where: { id: input.id, deletedAt: null } });
      if (!post) throw new NotFoundError("文章不存在");

      const approved = input.action === "APPROVE";
      await db.$transaction(async (tx) => {
        await tx.blogPost.update({
          where: { id: input.id },
          data: {
            status: approved ? "PUBLISHED" : "REVIEW",
            auditStatus: approved ? "PASSED" : "REJECTED",
            auditNote: approved ? null : (input.note || "内容不符合发布规范，请修改后重新提交。"),
            publishedAt: approved ? (post.publishedAt ?? new Date()) : post.publishedAt,
          },
        });
        await tx.auditRecord.create({
          data: {
            targetType: "POST",
            targetId: input.id,
            action: approved ? "PASS" : "REJECT",
            reviewerId: adminId,
            note: input.note || null,
          },
        });
      });
      const full = await postRepo.findMineById(post.userId, input.id);
      return full ? serializePostForEdit(full) : null;
    },
  };
}

/** 审核队列复用公开详情序列化（不含 Markdown 原文，避免队列页传输过大的正文源） */

export type PostService = ReturnType<typeof createPostService>;
