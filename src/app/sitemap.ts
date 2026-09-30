import type { MetadataRoute } from "next";
import { createPostService } from "@/modules/blog/services/post.service";
import { buildSitemapEntries } from "@/modules/blog/lib/seo";
import { env } from "@/config/env";

/**
 * 全站站点地图 `/sitemap.xml`（PRD §5.9：仅含 PUBLIC 文章 + 作者页 + 标签页）。
 *
 * 公开性过滤在仓储层（PUBLIC_LISTABLE，UNLISTED 天然排除——聚合位纪律）；
 * 本文件只做"取数 → 调用构建器"。构建器是纯函数（lib/seo.ts），条目结构可单测。
 *
 * 失效：发布/归档/改 slug 时 revalidatePath("/sitemap.xml")（post.actions 已接线）。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { posts, authors, tags } = await createPostService().listSitemapEntries();

  return buildSitemapEntries({
    posts: posts.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt.toISOString() })),
    authors: authors.map((username) => ({ username })),
    tags: tags.map((name) => ({ name })),
    siteUrl: env.APP_URL,
  });
}
