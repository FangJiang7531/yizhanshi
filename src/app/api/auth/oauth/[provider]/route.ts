import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizeUrl, createState, isProviderConfigured, OAUTH_STATE_COOKIE, type OAuthProvider } from "@/lib/auth/oauth-service";
import { env } from "@/config/env";

/**
 * OAuth 授权入口：GET /api/auth/oauth/github | /api/auth/oauth/google
 * 生成签名 state（短期 Cookie）后 302 到授权页。
 */

const PROVIDERS: OAuthProvider[] = ["github", "google"];

export async function GET(_request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!PROVIDERS.includes(provider as OAuthProvider)) {
    return NextResponse.redirect(new URL("/login?oauth=unknown", env.APP_URL));
  }
  const p = provider as OAuthProvider;
  if (!isProviderConfigured(p)) {
    return NextResponse.redirect(new URL("/login?oauth=unconfigured", env.APP_URL));
  }

  const { state, cookieValue } = createState();
  const authorizeUrl = buildAuthorizeUrl(p, state);
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 分钟内必须完成授权
  });
  return response;
}
