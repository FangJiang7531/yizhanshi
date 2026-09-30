/**
 * 博客路由可见性判定（PRD §3.1 路由总表的"公开"列）。
 *
 * 为什么单独抽一个纯函数：middleware 运行在边缘运行时，不能引入 Prisma 等
 * Node 专有依赖，也不能访问数据库。这里只做**路径字符串判定**，无任何副作用，
 * 因此可以被 middleware、页面、测试三处共用。
 *
 * 判定与 `(public)` 路由组必须保持一致：
 * - 放行（无需登录）：消费侧页面 + RSS + 凭 token 的草稿预览
 * - 拦截（需登录）：/blog/me、/blog/new、/blog/[id]/edit、/blog/moderation
 */

/** 精确匹配的公开路径 */
const PUBLIC_EXACT: readonly string[] = ["/blog", "/blog/tags", "/blog/search", "/blog/rss.xml"];

/** 前缀匹配的公开路径（均以 "/" 结尾，避免 /blog/tags 误放行 /blog/tags-x） */
const PUBLIC_PREFIXES: readonly string[] = [
  "/blog/p/",
  "/blog/u/",
  "/blog/tags/",
  // 草稿私密预览：凭证是 URL 里的 token 本身，因此无需登录 Cookie
  "/blog/preview/",
];

export function isPublicBlogPath(pathname: string): boolean {
  // 末尾斜杠归一：Next 默认把 `/blog/` 308 重定向到 `/blog`，但重定向发生在
  // middleware **之后** —— 不归一的话，手工在地址栏补了斜杠的访客会先被弹去登录页。
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  if (PUBLIC_EXACT.includes(path)) return true;
  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** 供测试断言使用的快照（防止常量被误删导致防线静默消失） */
export const __publicBlogRouteTable = {
  exact: PUBLIC_EXACT,
  prefixes: PUBLIC_PREFIXES,
} as const;
