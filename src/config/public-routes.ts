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
/**
 * 站点级公共资源（爬虫基础设施）。
 *
 * robots.txt / sitemap.xml 的消费者就是搜索引擎爬虫——它们天然不带登录
 * Cookie。若不在此放行，middleware 会把爬虫重定向到 /login（M8 冒烟实测
 * 踩中：/robots.txt → 302 /login?next=%2Frobots.txt，整站 SEO 直接失效）。
 *
 * 同理适用于将来新增的公开聚合资源（如 /atom.xml、/feed.json）。
 */
const PUBLIC_EXACT_SITE_FILES: readonly string[] = ["/robots.txt", "/sitemap.xml"];

function isPublicSiteFile(pathname: string): boolean {
  return PUBLIC_EXACT_SITE_FILES.includes(pathname);
}

const PUBLIC_PATH_MATCHERS: readonly ((pathname: string) => boolean)[] = [
  isPublicBlogPath,
  isPublicSiteFile,
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_MATCHERS.some((match) => match(pathname));
}
