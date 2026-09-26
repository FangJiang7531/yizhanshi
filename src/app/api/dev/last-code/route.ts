import { NextResponse, type NextRequest } from "next/server";
import { getE2ECapturedCode } from "@/lib/mail";

/**
 * E2E 专用：读取被捕获的注册验证码。
 * 双重门禁：NODE_ENV=development 且 E2E_CAPTURE_CODE=1 才启用；生产环境返回 404。
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development" || process.env.E2E_CAPTURE_CODE !== "1") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const email = request.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const code = getE2ECapturedCode(email);
  if (!code) return NextResponse.json({ error: "code not captured yet" }, { status: 404 });
  return NextResponse.json({ code });
}
