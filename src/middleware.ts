import { NextResponse, type NextRequest } from "next/server";
import { hasSessionCookie } from "@/lib/auth/session";

/**
 * 路由守卫（边缘粗判）：只判断“是否有会话 Cookie”，不做真伪校验。
 * 真伪与权限由服务层 getSession / requireAuth / requireNonGuest 完成三层防线。
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasCookie = hasSessionCookie(request.headers.get("cookie"));

  if (pathname === "/login") {
    // 已登录访问 /login → 进平台
    if (hasCookie) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // 平台区（其余全部页面）未登录 → 重定向登录页
  if (!hasCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // 静态资源与 API 不走此守卫（/api/health 必须始终可探活）
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
