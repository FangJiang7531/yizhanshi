"use server";

import { revalidatePath } from "next/cache";
import { requireNonGuest } from "@/lib/auth/guards";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createBookmarkService, type BookmarkDTO } from "../services/bookmark.service";
import {
  createBookmarkSchema,
  deleteBookmarkSchema,
  fetchTitleSchema,
  listBookmarksSchema,
  updateBookmarkSchema,
} from "../schemas";

/** 书签控制器 */

export async function createBookmarkAction(raw: unknown): Promise<ActionResult<BookmarkDTO>> {
  try {
    const user = await requireNonGuest();
    const data = createBookmarkSchema.parse(raw);
    const service = createBookmarkService();
    const result = await service.create(user.id, data);
    revalidatePath("/bookmarks");
    return ok(result);
  } catch (err) {
    logger.warn({ module: "bookmarks", err: (err as Error).message }, "createBookmarkAction");
    return fail(err);
  }
}

export async function listBookmarksAction(
  raw: unknown,
): Promise<ActionResult<{ items: BookmarkDTO[]; folders: { folder: string; count: number }[]; tags: { tag: string; count: number }[] }>> {
  try {
    const user = await requireNonGuest();
    const data = listBookmarksSchema.parse(raw ?? {});
    const service = createBookmarkService();
    const [items, folders, tags] = await Promise.all([
      service.list(user.id, data),
      service.folders(user.id),
      service.tags(user.id),
    ]);
    return ok({ items, folders, tags });
  } catch (err) {
    logger.warn({ module: "bookmarks", err: (err as Error).message }, "listBookmarksAction");
    return fail(err);
  }
}

export async function updateBookmarkAction(raw: unknown): Promise<ActionResult<BookmarkDTO>> {
  try {
    const user = await requireNonGuest();
    const data = updateBookmarkSchema.parse(raw);
    const service = createBookmarkService();
    return ok(await service.update(user.id, data));
  } catch (err) {
    logger.warn({ module: "bookmarks", err: (err as Error).message }, "updateBookmarkAction");
    return fail(err);
  }
}

export async function deleteBookmarkAction(raw: unknown): Promise<ActionResult<{ deleted: true }>> {
  try {
    const user = await requireNonGuest();
    const data = deleteBookmarkSchema.parse(raw);
    const service = createBookmarkService();
    const result = await service.remove(user.id, data.id);
    revalidatePath("/bookmarks");
    return ok(result);
  } catch (err) {
    logger.warn({ module: "bookmarks", err: (err as Error).message }, "deleteBookmarkAction");
    return fail(err);
  }
}

/** 抓取网页标题（新建书签自动填充） */
export async function fetchPageTitleAction(
  raw: unknown,
): Promise<ActionResult<{ title: string | null }>> {
  try {
    await requireNonGuest();
    const data = fetchTitleSchema.parse(raw);
    const service = createBookmarkService();
    return ok(await service.fetchTitle(data.url));
  } catch (err) {
    logger.warn({ module: "bookmarks", err: (err as Error).message }, "fetchPageTitleAction");
    return fail(err);
  }
}
