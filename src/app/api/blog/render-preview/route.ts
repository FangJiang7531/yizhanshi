import { NextResponse, type NextRequest } from "next/server";
import { getPrincipal } from "@/lib/auth/session";
import { toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { renderPreviewSchema } from "@/modules/blog/schemas";
import { renderMarkdown } from "@/modules/blog/lib/markdown";

export const dynamic = "force-dynamic";

/**
 * 编辑器实时预览渲染（制作流程 Step 5.3）。
 *
 * 与发布共用同一条 renderMarkdown 管线 —— 预览所见即最终所得
 * （净化策略、代码高亮、卡片替换、TOC 提取全部一致）。
 *
 * 安全：仅登录用户可用（访客进不了编辑器）；按用户限流（正常输入 debounce
 * 后远低于 60 次/分，此限额只拦脚本滥用）；正文长度与 saveDraftSchema 对齐。
 */
export async function POST(req: NextRequest) {
  try {
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    if ("guest" in principal) {
      return NextResponse.json({ error: "访客模式下无法使用编辑器" }, { status: 403 });
    }

    await enforceRateLimit(`blog:render-preview:${principal.user.id}`, 60, 60_000);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    }

    const parsed = renderPreviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 422 });
    }

    const { html, toc } = await renderMarkdown(parsed.data.contentMd);
    return NextResponse.json({ html, toc });
  } catch (err) {
    const appErr = toAppError(err);
    if (appErr.code !== "RATE_LIMITED") {
      logger.warn({ module: "blog", err: appErr.message }, "render-preview");
    }
    return NextResponse.json({ error: appErr.message }, { status: appErr.status });
  }
}
