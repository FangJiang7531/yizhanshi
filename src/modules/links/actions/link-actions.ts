"use server";

import { revalidatePath } from "next/cache";
import { requireNonGuest } from "@/lib/auth/guards";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createShortLinkService, type ShortLinkDTO } from "../services/link.service";
import { createLinkSchema, deleteLinkSchema, updateLinkSchema } from "../schemas";

/** 短链控制器 */

export async function createLinkAction(raw: unknown): Promise<ActionResult<ShortLinkDTO>> {
  try {
    const user = await requireNonGuest();
    const data = createLinkSchema.parse(raw);
    if (data.kind === "file") {
      return fail(new Error("文件短链请使用上传接口"));
    }
    if (!data.targetUrl) {
      return fail(new Error("请填写目标链接"));
    }
    const service = createShortLinkService();
    return ok(
      await service.createUrl(user.id, {
        targetUrl: data.targetUrl,
        customSlug: data.customSlug,
        title: data.title,
        description: data.description,
        expiresInDays: data.expiresInDays,
      }),
    );
  } catch (err) {
    logger.warn({ module: "links", err: (err as Error).message }, "createLinkAction");
    return fail(err);
  }
}

export async function createFileLinkAction(raw: {
  file: File;
  customSlug?: string;
  title?: string;
  description?: string;
  expiresInDays?: number;
}): Promise<ActionResult<ShortLinkDTO>> {
  try {
    const user = await requireNonGuest();
    if (!raw || !(raw.file instanceof File)) {
      return fail(new Error("请选择文件"));
    }
    const service = createShortLinkService();
    return ok(
      await service.createFile(user.id, raw.file, {
        customSlug: typeof raw.customSlug === "string" ? raw.customSlug : undefined,
        title: typeof raw.title === "string" ? raw.title : undefined,
        description: typeof raw.description === "string" ? raw.description : undefined,
        expiresInDays: typeof raw.expiresInDays === "number" ? raw.expiresInDays : 0,
      }),
    );
  } catch (err) {
    logger.warn({ module: "links", err: (err as Error).message }, "createFileLinkAction");
    return fail(err);
  }
}

export async function listLinksAction(
  raw: unknown,
): Promise<ActionResult<{ items: ShortLinkDTO[]; nextCursor: string | null }>> {
  try {
    const user = await requireNonGuest();
    const service = createShortLinkService();
    const cursor = typeof (raw as { cursor?: string })?.cursor === "string" ? (raw as { cursor: string }).cursor : null;
    return ok(await service.list(user.id, { cursor }));
  } catch (err) {
    logger.warn({ module: "links", err: (err as Error).message }, "listLinksAction");
    return fail(err);
  }
}

export async function updateLinkAction(raw: unknown): Promise<ActionResult<ShortLinkDTO>> {
  try {
    const user = await requireNonGuest();
    const data = updateLinkSchema.parse(raw);
    const service = createShortLinkService();
    const result = await service.update(user.id, data);
    revalidatePath("/links");
    return ok(result);
  } catch (err) {
    logger.warn({ module: "links", err: (err as Error).message }, "updateLinkAction");
    return fail(err);
  }
}

export async function deleteLinkAction(raw: unknown): Promise<ActionResult<{ deleted: true }>> {
  try {
    const user = await requireNonGuest();
    const data = deleteLinkSchema.parse(raw);
    const service = createShortLinkService();
    const result = await service.remove(user.id, data.id);
    revalidatePath("/links");
    return ok(result);
  } catch (err) {
    logger.warn({ module: "links", err: (err as Error).message }, "deleteLinkAction");
    return fail(err);
  }
}
