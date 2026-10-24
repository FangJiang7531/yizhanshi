import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCodeForProfile,
  isProviderConfigured,
  loginWithProfile,
  OAUTH_STATE_COOKIE,
  verifyState,
  type OAuthProvider,
} from "@/lib/auth/oauth-service";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

/**
 * OAuth 回调：GET /api/auth/oauth/{provider}/callback?code=...&state=...
 * 校验 state → 换 token → 拉档案 → 匹配/注册账号 → 建会话 Cookie → 跳转。
 * 失败一律回到 /login?oauth=error（不泄漏具体原因给前端，细节进日志）。
 */

const PROVIDERS: OAuthProvider[] = ["github", "google"];

function fail(code: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?oauth=${code}`, env.APP_URL));
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!PROVIDERS.includes(provider as OAuthProvider)) return fail("unknown");
  const p = provider as OAuthProvider;
  if (!isProviderConfigured(p)) return fail("unconfigured");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    logger.warn({ module: "oauth", provider: p, error: oauthError }, "授权被拒绝或失败");
    return fail("denied");
  }
  if (!code) return fail("missing_code");

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  if (!verifyState(state, stateCookie)) {
    logger.warn({ module: "oauth", provider: p }, "state 校验失败（CSRF 或过期）");
    return fail("state");
  }

  try {
    const profile = await exchangeCodeForProfile(p, code);
    const result = await loginWithProfile(profile);
    if (!result.ok) {
      logger.warn({ module: "oauth", provider: p, reason: result.reason }, "OAuth 登录未完成");
      return fail("login");
    }

    const response = NextResponse.redirect(
      new URL(result.isNew ? "/dashboard?welcome=oauth" : "/dashboard", env.APP_URL),
    );
    response.cookies.set(SESSION_COOKIE, result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    // 清理 state Cookie
    response.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  } catch (err) {
    logger.error({ module: "oauth", provider: p, err: (err as Error).message }, "OAuth 回调处理失败");
    return fail("error");
  }
}
