import { NextResponse, type NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { env } from "@/config/env";
import { verifyStorageKeySignature } from "@/modules/blog/lib/signed-url";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export const dynamic = "force-dynamic";

/**
 * 本地存储文件读取（头像、博客图片）。
 *
 * 访问控制按**路径前缀**划分（B-16）：
 * - `blog/draft/**` 草稿区：**必须**携带有效签名（`?exp=&sig=`），否则 404。
 *   返回 404 而非 403，避免通过状态码探测"某个草稿图是否存在"。
 * - `blog/pub/**` 公开区：发布固化后才存在于此，无需签名。
 * - 其它前缀（如 `avatars/**`）沿用阶段一行为。
 *
 * 路径穿越由 StorageAdapter.safePath 白名单兜底（仅字母数字与 / _ - .）。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const key = segments.join("/");

  // 草稿区访问控制：签名无效/缺失一律当作"不存在"
  if (key.startsWith("blog/draft/")) {
    const exp = Number(request.nextUrl.searchParams.get("exp") ?? "0");
    const sig = request.nextUrl.searchParams.get("sig") ?? "";
    if (!verifyStorageKeySignature(key, exp, sig, env.AUTH_SECRET)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }

  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: "unsupported file type" }, { status: 400 });
  }

  const data = await storage.get(key);
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      // 草稿图是私有的：不允许中间层缓存，避免签名 URL 被共享缓存长期留存
      "Cache-Control": key.startsWith("blog/draft/") ? "private, max-age=3600" : "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
