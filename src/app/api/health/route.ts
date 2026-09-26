import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** liveness：进程活着即返回 200，不检查外部依赖 */
export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
