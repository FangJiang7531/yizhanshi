"use server";

import { revalidatePath } from "next/cache";
import { getPrincipal, type SessionUser } from "@/lib/auth/session";
import { requireNonGuest, requireRole } from "@/lib/auth/guards";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { toLocalDateString } from "@/lib/date/timezone";
import {
  archivePostSchema,
  deletePostSchema,
  listMineSchema,
  moderateSchema,
  publishPostSchema,
  saveDraftSchema,
  updateSlugSchema,
} from "../schemas";
import { createPostService } from "../services/post.service";
import { createBlogImageService } from "../services/image.service";
import { createDataCardService } from "../services/data-card.service";
import type { MineStatsDTO, PostDetailDTO, PostEditDTO, PostListItemDTO } from "../types";

/**
 * 博客文章控制器（Server Actions，制作流程 Step 4.1）。
 *
 * 每个 Action 的固定流水线：**① 权限守卫 → ② Zod 校验 → ③ 服务层 → ④ 缓存失效**。
 * 无例外（Gate 4.1 判据 1、2）—— 权限守卫必须是第一行，Zod 校验是唯一的安全边界。
 *
 * 缓存失效放在这里而不是服务层：服务层保持框架无关（可在纯 Node 集成测试中直接调用）。
 */

/** 公开面缓存失效（文章被发布/归档/删除/改 slug 时都要做） */
function revalidatePublicSurfaces(username: string, ...slugs: (string | null | undefined)[]) {
  revalidatePath("/blog");
  for (const slug of slugs) {
    if (slug) {
      revalidatePath(`/blog/p/${slug}`);
      // 动态 OG 图（第三级回退）与文章同 slug 语义，一并失效（PRD §5.9）
      revalidatePath(`/blog/p/${slug}/og`);
    }
  }
  revalidatePath(`/blog/u/${username}`);
  revalidatePath(`/blog/u/${username}/rss.xml`);
  revalidatePath("/blog/tags");
  revalidatePath("/blog/rss.xml");
  revalidatePath("/sitemap.xml");
}

function revalidateMine() {
  revalidatePath("/blog/me");
}

export async function listMineAction(raw: unknown): Promise<ActionResult<{ items: PostListItemDTO[]; nextCursor: string | null }>> {
  try {
    const user = await requireNonGuest();
    const data = listMineSchema.parse(raw);
    const service = createPostService();
    const result = await service.listMine(user.id, {
      status: data.status,
      q: data.q,
      sort: data.sort,
      cursor: data.cursor,
      take: data.take,
    });
    return ok(result);
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "listMineAction");
    return fail(err);
  }
}

export async function mineStatsAction(): Promise<ActionResult<MineStatsDTO>> {
  try {
    const user = await requireNonGuest();
    const service = createPostService();
    return ok(await service.mineStats(user.id));
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "mineStatsAction");
    return fail(err);
  }
}

export async function createDraftAction(): Promise<ActionResult<PostEditDTO>> {
  try {
    const user = await requireNonGuest();
    const service = createPostService();
    const post = await service.createDraft(user.id);
    revalidateMine();
    return ok(post);
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "createDraftAction");
    return fail(err);
  }
}

export async function saveDraftAction(raw: unknown): Promise<ActionResult<{ post: PostEditDTO }>> {
  try {
    const user = await requireNonGuest();
    const data = saveDraftSchema.parse(raw);
    const service = createPostService();
    const result = await service.saveDraft(user.id, data);
    // 草稿不公开，无需失效公开面；但 /blog/me 的统计与列表要更新
    revalidateMine();
    return ok(result);
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "saveDraftAction");
    return fail(err);
  }
}

export async function publishPostAction(raw: unknown): Promise<ActionResult<{ slug: string; status: string }>> {
  try {
    const user = await requireNonGuest();
    const data = publishPostSchema.parse(raw);
    const service = createPostService();
    const imageService = createBlogImageService();
    const cardService = createDataCardService();

    // ④ 图片固化：草稿态签名 URL → 公开路径（PRD §5.3 步骤④）
    const promotedContent = await imageService.promoteForPublish(user.id, data.contentMd);
    const promotedCover = await imageService.promoteForPublish(user.id, data.coverImage ?? null);

    // ⑤ 数据卡片快照固化：把正文中每个卡片标记的 snapshot 刷新为"此刻"的数据
    //    （否则"本周打卡 N 天"会随下周到来变成 0 天；策划文档 §8.5）
    const today = toLocalDateString(new Date(), user.timezone);
    const withSnapshots = await cardService.injectSnapshots(
      promotedContent ?? data.contentMd,
      user.id,
      today,
      user.timezone,
    );

    const result = await service.publish(user.id, {
      ...data,
      contentMd: withSnapshots,
      coverImage: promotedCover ?? undefined,
    });

    revalidateMine();
    revalidatePublicSurfaces(user.username, result.post.slug);
    return ok({ slug: result.post.slug, status: result.status });
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "publishPostAction");
    return fail(err);
  }
}

export async function archivePostAction(raw: unknown): Promise<ActionResult<{ slug: string }>> {
  try {
    const user = await requireNonGuest();
    const data = archivePostSchema.parse(raw);
    const service = createPostService();
    const post = await service.archive(user.id, data.id);
    revalidateMine();
    revalidatePublicSurfaces(user.username, post.slug);
    return ok({ slug: post.slug });
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "archivePostAction");
    return fail(err);
  }
}

export async function unarchivePostAction(raw: unknown): Promise<ActionResult<{ slug: string }>> {
  try {
    const user = await requireNonGuest();
    const data = archivePostSchema.parse(raw);
    const service = createPostService();
    const post = await service.unarchive(user.id, data.id);
    revalidateMine();
    return ok({ slug: post.slug });
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "unarchivePostAction");
    return fail(err);
  }
}

export async function deletePostAction(raw: unknown): Promise<ActionResult<{ deleted: true }>> {
  try {
    const user = await requireNonGuest();
    const data = deletePostSchema.parse(raw);
    const service = createPostService();
    const existing = await service.getForEdit(user.id, data.id);
    await service.softDelete(user.id, data.id);
    revalidateMine();
    revalidatePublicSurfaces(user.username, existing.slug);
    return ok({ deleted: true });
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "deletePostAction");
    return fail(err);
  }
}

export async function updateSlugAction(raw: unknown): Promise<ActionResult<{ oldSlug: string; newSlug: string }>> {
  try {
    const user = await requireNonGuest();
    const data = updateSlugSchema.parse(raw);
    const service = createPostService();
    const result = await service.updateSlug(user.id, data.id, data.slug);
    revalidateMine();
    // 新旧两条路径都要失效，否则旧链接仍能命中缓存
    revalidatePublicSurfaces(user.username, result.oldSlug, result.newSlug);
    return ok(result);
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "updateSlugAction");
    return fail(err);
  }
}

/** 作者编辑页读取（仅本人；他人 postId 返回 404 语义） */
export async function getPostForEditAction(raw: unknown): Promise<ActionResult<PostEditDTO>> {
  try {
    const user = await requireNonGuest();
    const data = archivePostSchema.parse(raw); // { id }
    const service = createPostService();
    return ok(await service.getForEdit(user.id, data.id));
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "getPostForEditAction");
    return fail(err);
  }
}

/** 审核队列（ADMIN；非管理员一律 403，不泄露页面存在，C-04） */
export async function listModerationQueueAction(): Promise<ActionResult<PostDetailDTO[]>> {
  try {
    await requireRole("ADMIN");
    const service = createPostService();
    return ok(await service.listModerationQueue());
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "listModerationQueueAction");
    return fail(err);
  }
}

export async function moderatePostAction(raw: unknown): Promise<ActionResult<{ reviewed: true }>> {
  try {
    const admin = await requireRole("ADMIN");
    const data = moderateSchema.parse(raw);
    const service = createPostService();
    const post = await service.moderate(admin.id, {
      id: data.id,
      action: data.action,
      note: data.note || undefined,
    });
    revalidateMine();
    revalidatePublicSurfaces(post?.author.username ?? "", post?.slug);
    return ok({ reviewed: true });
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "moderatePostAction");
    return fail(err);
  }
}

/**
 * 查看者身份查询 —— 供**公开页**的客户端组件判断登录态（Gate 5.2 强制约束）。
 *
 * 为什么必须有这个 Action：详情页是 ISR 缓存的，服务端渲染时读 Session 会导致
 * ① ISR 失效（动态 API 使路由转为动态渲染）② 更严重的是「用户 A 的登录态被缓存
 * 后展示给用户 B」。因此公开页的服务端只输出**与身份无关**的内容，登录态一律
 * 由客户端组件在挂载后自行查询。
 *
 * 匿名访问是**正常状态**而非错误（公开页允许未登录），故返回 ok 而不是
 * UnauthorizedError —— 否则客户端要靠"捕获错误"来判断未登录，语义模糊。
 */
export async function getViewerIdentityAction(): Promise<
  ActionResult<{ userId: string | null; isGuest: boolean; username: string | null }>
> {
  try {
    const principal = await getPrincipal();
    if (!principal) return ok({ userId: null, isGuest: false, username: null });
    if ("guest" in principal) return ok({ userId: null, isGuest: true, username: null });
    const user: SessionUser = principal.user;
    return ok({ userId: user.id, isGuest: false, username: user.username });
  } catch (err) {
    return fail(err);
  }
}
