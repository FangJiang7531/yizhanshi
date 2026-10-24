"use server";

import { mkdir, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { requireNonGuest } from "@/lib/auth/guards";
import { getPrincipal } from "@/lib/auth/session";
import { fail, ok, RateLimitError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { submitFeedbackSchema } from "../schemas";

/**
 * 需求反馈控制器：
 * - 提交：写 FeatureRequest 表 + 追加归档文件 feedback/意见征集.md（用户要求的「保存到文件夹的意见征集表单」）；
 * - 查看：仅 ADMIN（后台随时可看）；
 * - 限流：每人 5 条/分钟。
 */

const FEEDBACK_DIR = "feedback";

async function appendToFile(entry: string) {
  try {
    const dir = resolve(process.cwd(), FEEDBACK_DIR);
    await mkdir(dir, { recursive: true });
    await appendFile(resolve(dir, "意见征集.md"), entry, "utf-8");
  } catch (err) {
    // 文件归档失败不影响主流程（DB 已落库）
    logger.warn({ module: "feedback", err: (err as Error).message }, "意见征集文件写入失败");
  }
}

export async function submitFeedbackAction(
  raw: unknown,
): Promise<ActionResult<{ submitted: true }>> {
  try {
    const principal = await getPrincipal();
    if (!principal) {
      return fail(new Error("请先登录后再提交反馈"));
    }
    const data = submitFeedbackSchema.parse(raw);

    // 限流：同一身份 5 条/分钟
    const since = new Date(Date.now() - 60_000);
    const recent = await prisma.featureRequest.count({
      where: {
        createdAt: { gte: since },
        ...(principal && "user" in principal ? { userId: principal.user.id } : {}),
      },
    });
    if (recent >= 5) {
      throw new RateLimitError("提交太频繁了，请稍后再试");
    }

    const authorName =
      principal && "user" in principal
        ? (principal.user.displayName ?? principal.user.username)
        : "访客";
    const userId = principal && "user" in principal ? principal.user.id : null;

    const created = await prisma.featureRequest.create({
      data: {
        userId,
        authorName: authorName.slice(0, 100),
        source: data.source.slice(0, 100),
        content: data.content,
      },
    });

    await appendToFile(
      `\n## ${new Date(created.createdAt).toLocaleString("zh-CN")} · ${created.source}\n- 提交人：${created.authorName}\n- 内容：${created.content}\n`,
    );

    return ok({ submitted: true });
  } catch (err) {
    logger.warn({ module: "feedback", err: (err as Error).message }, "submitFeedbackAction");
    return fail(err);
  }
}

export type FeedbackItemDTO = {
  id: string;
  authorName: string;
  source: string;
  content: string;
  status: string;
  createdAt: string;
};

/** 管理端列表（仅 ADMIN） */
export async function listFeedbackAction(): Promise<ActionResult<FeedbackItemDTO[]>> {
  try {
    const user = await requireNonGuest();
    if (user.role !== "ADMIN") {
      return fail(new Error("没有查看反馈的权限"));
    }
    const rows = await prisma.featureRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return ok(
      rows.map((r) => ({
        id: r.id,
        authorName: r.authorName,
        source: r.source,
        content: r.content,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    logger.warn({ module: "feedback", err: (err as Error).message }, "listFeedbackAction");
    return fail(err);
  }
}

/** 管理端标记状态 */
export async function markFeedbackStatusAction(
  raw: { id: string; status: "NEW" | "PLANNED" | "DONE" },
): Promise<ActionResult<{ updated: true }>> {
  try {
    const user = await requireNonGuest();
    if (user.role !== "ADMIN") {
      return fail(new Error("没有操作权限"));
    }
    await prisma.featureRequest.update({
      where: { id: raw.id },
      data: { status: raw.status },
    });
    return ok({ updated: true });
  } catch (err) {
    logger.warn({ module: "feedback", err: (err as Error).message }, "markFeedbackStatusAction");
    return fail(err);
  }
}
