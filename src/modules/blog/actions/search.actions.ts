"use server";

import { getPrincipal } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { searchSchema } from "../schemas";
import { createSearchService } from "../services/search.service";
import type { SearchResultDTO, TagCloudItemDTO } from "../types";

/**
 * 搜索页控制器（PRD §5.7）。
 *
 * 与 loadMorePostsAction 同一模式：公开能力，但依然读取 principal——
 * 用途是给空状态返回 canWrite（登录作者看到"写一篇相关文章"引导，
 * 访客看到纯文案），不是放行/拦截。
 *
 * 服务层的触发门槛（≥2 字符）在 schema 与 service 各拦一道：
 * schema 拦"恶意超长/空串"，service 拦"1 个字符的合法但无意义查询"。
 */

export type SearchPostsResult = {
  result: SearchResultDTO;
  /** 结果为空时用于推荐热门标签（PRD §5.7 空状态），非空时为 null 减载荷 */
  popularTags: TagCloudItemDTO[] | null;
  /** 当前查看者是否可写作（空状态引导按钮） */
  canWrite: boolean;
};

export async function searchPostsAction(raw: unknown): Promise<ActionResult<SearchPostsResult>> {
  try {
    const principal = await getPrincipal();
    const input = searchSchema.parse(raw);

    const service = createSearchService();
    const result = await service.search(input.q, { cursor: input.cursor, take: input.take });

    const popularTags = result.items.length === 0 ? await service.popularTags(8) : null;

    return ok({
      result,
      popularTags,
      canWrite: principal !== null && "user" in principal,
    });
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "searchPostsAction");
    return fail(err);
  }
}
