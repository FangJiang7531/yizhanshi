import { getPrincipal, type GuestPrincipal, type SessionUser } from "./session";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

/**
 * RBAC 守卫（三层权限模型的服务层落点）。
 * 服务层永远带 userId 作用域——这是不依赖调用方是否记得检查的结构性保障。
 */

type Principal = NonNullable<Awaited<ReturnType<typeof getPrincipal>>>;

export async function getPrincipalOrThrow(): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) throw new UnauthorizedError();
  return principal;
}

/** 要求已登录（正式用户）；未登录抛 401 */
export async function requireAuth(): Promise<SessionUser> {
  const principal = await getPrincipalOrThrow();
  if ("guest" in principal) throw new UnauthorizedError();
  return principal.user;
}

/** 要求非访客（USER/ADMIN）；访客抛 403，携带转化引导文案 */
export async function requireNonGuest(): Promise<SessionUser> {
  const principal = await getPrincipalOrThrow();
  if ("guest" in principal) {
    throw new ForbiddenError("访客模式下无法保存数据，注册账号即可解锁全部功能");
  }
  return principal.user;
}

/** 要求指定角色 */
export async function requireRole(role: SessionUser["role"]): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role !== role) {
    throw new ForbiddenError("没有执行该操作的权限");
  }
  return user;
}

export function isGuest(principal: Principal | null): principal is { guest: GuestPrincipal } {
  return principal !== null && "guest" in principal;
}
