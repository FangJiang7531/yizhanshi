import { Feed } from "feed";
import type { PostListItemDTO } from "../types";

/**
 * RSS 生成（PRD §5.8 / 策划文档 §6.5）。
 *
 * 纯函数：输入文章列表与频道信息，输出 RSS 2.0 XML 字符串。
 * 路由层（route.ts）负责取数与缓存头，这里只负责拼装——这样 XML 的
 * 结构（自链接、GUID、转义）可以在单元测试里逐项断言，不必起服务。
 *
 * 用 `feed` 库（@6）而非手拼字符串：XML 转义、RFC 822 日期格式、
 * channel/item 结构这些坑它都踩过了；W3C 校验器可过（验收 E-08）。
 */

export type RssChannel = {
  /** 频道标题，如 "博客 · 全站" / "张三 的文章" */
  title: string;
  /** 频道描述 */
  description: string;
  /** 站点首页（channel.link） */
  siteUrl: string;
  /** feed 自身地址（atom:link rel="self"） */
  feedUrl: string;
  /** 站点名（版权行） */
  siteName: string;
};

/** 摘要口径：excerpt 缺失时兜底为空串（feed 库不允许 undefined description） */
function itemDescription(post: PostListItemDTO): string {
  return post.excerpt?.trim() || `${post.title} —— ${post.author.displayName ?? post.author.username}`;
}

/**
 * 生成 RSS 2.0。`items` 应已按发布时间倒序、且只含 PUBLISHED+PUBLIC+PASSED
 * （仓储层保证，PRD §5.8 排除项：PRIVATE/UNLISTED/草稿/待审/驳回/已删一律不进 feed）。
 */
export function buildRssXml(items: PostListItemDTO[], channel: RssChannel): string {
  const feed = new Feed({
    title: channel.title,
    description: channel.description,
    id: channel.siteUrl,
    link: channel.siteUrl,
    language: "zh-CN",
    // atom:link rel="self"——feed@6 的 rss2() 从 options.feed 读取
    feed: channel.feedUrl,
    favicon: `${channel.siteUrl}/favicon.ico`,
    copyright: `© ${new Date().getFullYear()} ${channel.siteName}`,
    updated: items[0]?.publishedAt ? new Date(items[0].publishedAt) : new Date(),
    generator: "personal-workbench",
    feedLinks: {
      self: channel.feedUrl,
    },
  });

  for (const post of items) {
    const link = `${channel.siteUrl}/blog/p/${post.slug}`;
    const authorName = post.author.displayName ?? post.author.username;
    feed.addItem({
      title: post.title,
      id: link,
      link,
      description: itemDescription(post),
      // GUID 用文章链接（PRD §5.8：GUID(slug)；feed 库标记 isPermaLink=false）
      date: post.publishedAt ? new Date(post.publishedAt) : new Date(post.updatedAt),
      author: [
        {
          // RSS 2.0 的 <author> 要求 "email (Name)" 格式（W3C 校验器硬性检查）。
          // 不暴露用户真实邮箱——用 noreply 占位，阅读器只展示 name 部分。
          name: authorName,
          email: `noreply@${new URL(channel.siteUrl).hostname}`,
          link: `${channel.siteUrl}/blog/u/${post.author.username}`,
        },
      ],
      category: post.tags.map((t) => ({ name: t.name })),
      published: post.publishedAt ? new Date(post.publishedAt) : undefined,
    });
  }

  return feed.rss2();
}
