import { NextResponse, type NextRequest } from "next/server";
import { createShortLinkService } from "@/modules/links/services/link.service";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

/**
 * 短链跳转：GET /s/[slug]
 * url 短链 → 302 到目标；file 短链 → 代理下载（流式回源存储）。
 * 过期/停用/不存在 → 统一 404 页面（不泄漏存在性）。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = createShortLinkService();

  const row = await service.resolve(slug).catch(() => null);
  if (!row) {
    return NextResponse.redirect(new URL("/links/gone", env.APP_URL));
  }

  try {
    await service.recordClick(slug, {
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? undefined,
      userAgent: request.headers.get("user-agent"),
      referer: request.headers.get("referer"),
    });
  } catch (err) {
    // 计数失败不阻断跳转
    logger.warn({ module: "links", err: (err as Error).message }, "点击计数失败");
  }

  if (row.kind === "url" && row.targetUrl) {
    return NextResponse.redirect(row.targetUrl, 302);
  }

  // 文件短链：读取存储并代理下载
  if (row.fileKey) {
    const { storage } = await import("@/lib/storage");
    const data = await storage.get(row.fileKey).catch(() => null);
    if (!data) {
      return NextResponse.redirect(new URL("/links/gone", env.APP_URL));
    }
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": row.mimeType || "application/octet-stream",
        "Content-Length": String(data.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName || "file")}`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.redirect(new URL("/links/gone", env.APP_URL));
}
