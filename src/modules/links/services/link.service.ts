import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma as defaultPrisma } from "@/lib/db";
import { env } from "@/config/env";
import { storage } from "@/lib/storage";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { hashIp } from "@/lib/auth/session";

/**
 * 短链服务：URL 短链 + 文件分享短链（含访问统计）。
 *
 * 短码：Base62（crypto 随机 6 字符 ≈ 5×10^10 组合）；自定义别名撞车返回 409。
 * 文件短链走存储抽象（与博客图片同驱动），下载走带计数的专用路由。
 */

const SLUG_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SLUG_LENGTH = 6;

function randomSlug(): string {
  const bytes = randomBytes(SLUG_LENGTH);
  let out = "";
  for (const b of bytes) out += SLUG_ALPHABET[b % 62];
  return out;
}

/** 服务端 SSRF 防护：拒绝内网/环回/保留地址的 http(s) URL */
export function assertSafeTargetUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ValidationError({ targetUrl: ["链接格式不合法"] }, "链接格式不合法");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ValidationError({ targetUrl: ["仅支持 http/https 链接"] }, "仅支持 http/https 链接");
  }
  const host = parsed.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^0\./.test(host) ||
    host === "[::1]" ||
    host === "::1";
  if (blocked) {
    throw new ValidationError({ targetUrl: ["不允许使用内网或本机地址"] }, "不允许使用内网或本机地址");
  }
  return parsed.toString();
}

export type ShortLinkDTO = {
  id: string;
  slug: string;
  kind: "url" | "file";
  targetUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  title: string | null;
  description: string | null;
  isActive: boolean;
  expiresAt: string | null;
  clickCount: number;
  lastClickAt: string | null;
  createdAt: string;
  /** 短链完整地址（服务端拼好，前端直接复制） */
  shortUrl: string;
};

function toDTO(row: {
  id: string;
  slug: string;
  kind: string;
  targetUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  title: string | null;
  description: string | null;
  isActive: boolean;
  expiresAt: Date | null;
  clickCount: number;
  lastClickAt: Date | null;
  createdAt: Date;
}): ShortLinkDTO {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind === "file" ? "file" : "url",
    targetUrl: row.targetUrl,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    title: row.title,
    description: row.description,
    isActive: row.isActive,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    clickCount: row.clickCount,
    lastClickAt: row.lastClickAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    shortUrl: `${env.APP_URL}/s/${row.slug}`,
  };
}

export function createShortLinkService(db: PrismaClient = defaultPrisma) {
  /** 生成不冲突的短码（重试 5 次，冲突率 5×10^10 组合下可忽略） */
  async function newSlug(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const candidate = randomSlug();
      const exists = await db.shortLink.findUnique({ where: { slug: candidate }, select: { id: true } });
      if (!exists) return candidate;
    }
    throw new ConflictError("短码生成冲突，请重试");
  }

  return {
    async createUrl(
      userId: string,
      input: { targetUrl: string; customSlug?: string; title?: string; description?: string; expiresInDays?: number },
    ): Promise<ShortLinkDTO> {
      const targetUrl = assertSafeTargetUrl(input.targetUrl);
      const expiresAt =
        input.expiresInDays && input.expiresInDays > 0
          ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
          : null;

      if (input.customSlug) {
        const exists = await db.shortLink.findUnique({ where: { slug: input.customSlug }, select: { id: true } });
        if (exists) throw new ConflictError("该别名已被占用");
      }
      const created = await db.shortLink.create({
        data: {
          userId,
          slug: input.customSlug ?? (await newSlug()),
          kind: "url",
          targetUrl,
          title: input.title ?? null,
          description: input.description ?? null,
          expiresAt,
        },
      });
      return toDTO(created);
    },

    /** 文件分享短链：文件先落存储，再建短链记录 */
    async createFile(
      userId: string,
      file: File,
      opts: { customSlug?: string; title?: string; description?: string; expiresInDays?: number } = {},
    ): Promise<ShortLinkDTO> {
      if (file.size === 0) throw new ValidationError({ file: ["文件内容为空"] }, "文件内容为空");
      if (file.size > 20 * 1024 * 1024) {
        throw new ValidationError({ file: ["文件不能超过 20MB"] }, "文件过大");
      }
      const safeName = (file.name || "file").replace(/[^A-Za-z0-9._\-\u4e00-\u9fff]/g, "_").slice(0, 120);
      const ext = safeName.includes(".") ? safeName.split(".").pop() : "bin";
      const key = `links/${userId}/${Date.now()}-${randomBytes(3).toString("hex")}.${ext}`;

      const buf = Buffer.from(await file.arrayBuffer());
      await storage.put(key, buf, file.type || "application/octet-stream");

      const expiresAt =
        opts.expiresInDays && opts.expiresInDays > 0
          ? new Date(Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000)
          : null;

      if (opts.customSlug) {
        const exists = await db.shortLink.findUnique({ where: { slug: opts.customSlug }, select: { id: true } });
        if (exists) throw new ConflictError("该别名已被占用");
      }
      const created = await db.shortLink.create({
        data: {
          userId,
          slug: opts.customSlug ?? (await newSlug()),
          kind: "file",
          fileKey: key,
          fileName: safeName,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
          title: opts.title ?? safeName,
          description: opts.description ?? null,
          expiresAt,
        },
      });
      return toDTO(created);
    },

    /** 我的短链列表（分页倒序） */
    async list(userId: string, opts: { take?: number; cursor?: string | null } = {}) {
      const take = opts.take ?? 50;
      const rows = await db.shortLink.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: take + 1,
        ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      });
      const hasMore = rows.length > take;
      return {
        items: (hasMore ? rows.slice(0, take) : rows).map(toDTO),
        nextCursor: hasMore ? (rows[take]?.id ?? null) : null,
      };
    },

    /** 更新（启用/停用/标题/备注） */
    async update(userId: string, input: { id: string; isActive?: boolean; title?: string; description?: string }) {
      const row = await db.shortLink.findFirst({ where: { id: input.id, userId }, select: { id: true } });
      if (!row) throw new NotFoundError("短链不存在");
      const updated = await db.shortLink.update({
        where: { id: input.id },
        data: {
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      });
      return toDTO(updated);
    },

    /** 删除（文件短链同时删存储对象） */
    async remove(userId: string, id: string) {
      const row = await db.shortLink.findFirst({ where: { id, userId } });
      if (!row) throw new NotFoundError("短链不存在");
      if (row.fileKey) await storage.delete(row.fileKey).catch(() => undefined);
      await db.shortLink.delete({ where: { id } });
      return { deleted: true as const };
    },

    /** 解析短码（跳转路由用）：不存在/停用/过期统一返回 null */
    async resolve(slug: string) {
      const row = await db.shortLink.findUnique({ where: { slug } });
      if (!row || !row.isActive) return null;
      if (row.expiresAt && row.expiresAt < new Date()) return null;
      return row;
    },

    /** 记录一次点击（明细 + 计数同事务） */
    async recordClick(slug: string, meta: { ip?: string; userAgent?: string | null; referer?: string | null }) {
      const row = await db.shortLink.findUnique({ where: { slug }, select: { id: true } });
      if (!row) return;
      await db.$transaction([
        db.linkVisit.create({
          data: {
            linkId: row.id,
            ipHash: hashIp(meta.ip ?? undefined),
            userAgent: meta.userAgent?.slice(0, 500) ?? null,
            referer: meta.referer?.slice(0, 500) ?? null,
          },
        }),
        db.shortLink.update({
          where: { id: row.id },
          data: { clickCount: { increment: 1 }, lastClickAt: new Date() },
        }),
      ]);
    },

    /** 7 日点击趋势（数据卡片） */
    async weeklyClicks(userId: string, linkId: string) {
      const row = await db.shortLink.findFirst({ where: { id: linkId, userId }, select: { id: true } });
      if (!row) throw new NotFoundError("短链不存在");
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const rows = await db.linkVisit.groupBy({
        by: ["visitedAt"],
        where: { linkId: row.id, visitedAt: { gte: since } },
        _count: { _all: true },
      });
      // 按日聚合
      const byDay = new Map<string, number>();
      for (const r of rows) {
        const day = new Date(r.visitedAt).toISOString().slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + r._count._all);
      }
      return Array.from(byDay.entries()).map(([date, count]) => ({ date, count }));
    },
  };
}

export type ShortLinkService = ReturnType<typeof createShortLinkService>;
