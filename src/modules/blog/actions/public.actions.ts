"use server";

import { getPrincipal } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { loadMorePostsSchema } from "../schemas";
import { createPostService } from "../services/post.service";
import type { PostListItemDTO } from "../types";

/**
 * 公开列表的"加载更多"控制器。
 *
 * 存在的理由：公开页要求 ISR/SSG（PRD §3.1），而分页链接里的 `?cursor=` 会让
 * 页面读取 `searchParams`，从而把整条路由拉回动态渲染。改由客户端按需调用本
 * Action，首屏保持静态，后续分页不影响缓存策略。
 *
 * 关于权限：本 Action 对匿名访客开放（公开内容是产品要求），但依然读取
 * principal —— 用途是返回 **viewer 上下文**（能否写作 / 是否本人主页），
 * 供空状态与卡片显示正确的引导按钮，而不是放行/拦截。
 */

export type LoadMorePostsResult = {
  items: PostListItemDTO[];
  nextCursor: string | null;
  /** 当前查看者是否具备写作能力（已登录的非访客） */
  canWrite: boolean;
  /** 当前查看者是否为请求的作者本人（作者主页用） */
  isOwner: boolean;
};

export async function loadMorePostsAction(raw: unknown): Promise<ActionResult<LoadMorePostsResult>> {
  try {
    const principal = await getPrincipal();
    const input = loadMorePostsSchema.parse(raw);
    const service = createPostService();

    let items: PostListItemDTO[];
    let nextCursor: string | null;

    if (input.scope === "tag") {
      ({ items, nextCursor } = await service.listByTag(input.tag!, { take: input.take, cursor: input.cursor }));
    } else if (input.scope === "author") {
      ({ items, nextCursor } = await service.listByAuthor(input.username!, {
        take: input.take,
        cursor: input.cursor,
      }));
    } else {
      ({ items, nextCursor } = await service.listPublic({
        tab: input.tab ?? "latest",
        take: input.take,
        cursor: input.cursor,
      }));
    }

    const isUser = principal !== null && "user" in principal;
    return ok({
      items,
      nextCursor,
      canWrite: isUser,
      isOwner: isUser && input.scope === "author" && principal.user.username === input.username,
    });
  } catch (err) {
    logger.warn({ module: "blog", err: (err as Error).message }, "loadMorePostsAction");
    return fail(err);
  }
}
