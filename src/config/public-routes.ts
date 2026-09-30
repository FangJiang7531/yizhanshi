import { isPublicBlogPath } from "@/modules/blog/lib/route-visibility";

/**
 * 公开路由注册表 —— middleware 的"边缘粗判"输入。
 *
 * 背景（PRD §6.1 三层权限模型）：阶段一的工作台是**全站登录制**，middleware
 * 对任何无会话 Cookie 的请求一律跳登录页。阶段二的博客是首个"公开消费侧"板块
 * （PRD §3.1 明确 `/blog`、`/blog/p/[slug]` 等为公开），且 SEO 要求爬虫无 Cookie
 * 也能抓取 —— 因此需要一个"哪些路径无需登录"的判定。
 *
 * 为什么放在 config 而不是写死在 middleware：
 * middleware 不应认识任何具体板块。后续短链 / 书签 / 问卷的公开页只需在此
 * 注册表追加一行，middleware 源码保持不变。
 *
 * 注意：这里只做**路径粗判**。真伪校验与业务权限仍由服务层
 * `getPrincipal()` / `requireAuth()` / `requireNonGuest()` 完成，
 * 三层防线一层都不少。
 */
const PUBLIC_PATH_MATCHERS: readonly ((pathname: string) => boolean)[] = [isPublicBlogPath];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_MATCHERS.some((match) => match(pathname));
}
