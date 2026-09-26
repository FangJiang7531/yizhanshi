import { NextResponse, type NextRequest } from "next/server";
import { storage } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export const dynamic = "force-dynamic";

/**
 * 本地存储文件读取（头像等上传物）。
 * GET /api/files/avatars/<userId>.png
 * 路径穿越由 StorageAdapter.safePath 白名单兜底（仅字母数字与 / _ - .）。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const key = segments.join("/");
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
      "Cache-Control": "public, max-age=86400",
    },
  });
}
