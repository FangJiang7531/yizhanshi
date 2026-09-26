import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "pwb_session";
const GUEST_COOKIE = "pwb_guest";

function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return (
    cookieHeader.includes(`${SESSION_COOKIE}=`) || cookieHeader.includes(`${GUEST_COOKIE}=`)
  );
}

/**
 * 路由守卫（边缘粗判，PRD §6.1 入口策略）。
 *
 * 只判断「是否有会话 Cookie」，不做真伪与业务权限校验——那由服务层
 * `getPrincipal()` / `requireAuth()` / `requireNonGuest()` 完成。
 * 三层都要做的原因：中间件可能被新路由规则绕过，只有服务层强制 userId
 * 作用域是不依赖调用方是否记得检查的结构性保障（策划文档 §五(三)）。
 *
 * 同时注入 `x-pathname`，供占位页组件在服务端读取当前路径。
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasCookie = hasSessionCookie(request.headers.get("cookie"));

  if (pathname === "/login") {
    if (hasCookie) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return withPathname(request);
  }

  if (!hasCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return withPathname(request);
}

function withPathname(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // 静态资源与 API 不走此守卫（/api/health 必须始终可探活）
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)",
  ],
};
