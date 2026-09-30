import type { MetadataRoute } from "next";
import { buildRobotsRules } from "@/modules/blog/lib/seo";
import { env } from "@/config/env";

/**
 * 爬虫规则 `/robots.txt`（PRD §5.9）。
 * 规则本体在 lib/seo.ts（可单测、防止规则散落被误改）：
 * 允许公开内容；禁止创作入口、审核队列、API、凭 token 的草稿预览。
 */
export default function robots(): MetadataRoute.Robots {
  return buildRobotsRules(env.APP_URL);
}
