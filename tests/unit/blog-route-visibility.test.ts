import { describe, expect, it } from "vitest";
import { isPublicBlogPath, __publicBlogRouteTable } from "@/modules/blog/lib/route-visibility";
import { isPublicPath } from "@/config/public-routes";

/**
 * 公开路由判定（PRD §3.1 权限列 / Gate 5.1 判据 1）。
 *
 * 这是"未登录能否访问"的第一道闸门，判错的方向性后果不对称：
 * - 把该拦的判成公开 → 未登录直接看到创作侧页面（功能坏掉，但不泄漏数据）
 * - 把该放的判成私有 → 公开内容对访客与爬虫全部 404/跳登录（SEO 归零）
 * 因此用例必须覆盖"每个公开前缀"与"每个受保护路径"两侧，且包含边界串。
 */

describe("isPublicBlogPath · 放行（消费侧）", () => {
  it("发现页 / 标签总览 / 搜索页 / 全站 RSS", () => {
    expect(isPublicBlogPath("/blog")).toBe(true);
    expect(isPublicBlogPath("/blog/tags")).toBe(true);
    expect(isPublicBlogPath("/blog/search")).toBe(true);
    expect(isPublicBlogPath("/blog/rss.xml")).toBe(true);
  });

  it("文章详情与作者主页（含作者 RSS）", () => {
    expect(isPublicBlogPath("/blog/p/hello-world")).toBe(true);
    expect(isPublicBlogPath("/blog/u/zhang_san")).toBe(true);
    expect(isPublicBlogPath("/blog/u/zhang_san/rss.xml")).toBe(true);
  });

  it("标签归档（含中文与 URL 编码）", () => {
    expect(isPublicBlogPath("/blog/tags/%E6%95%88%E7%8E%87")).toBe(true);
  });

  it("草稿私密预览：凭证是 URL 里的 token，不依赖登录 Cookie", () => {
    expect(isPublicBlogPath("/blog/preview/abc123def456")).toBe(true);
  });

  it("末尾斜杠被归一（否则手工补斜杠的访客会被弹去登录页）", () => {
    expect(isPublicBlogPath("/blog/")).toBe(true);
    expect(isPublicBlogPath("/blog/p/hello-world/")).toBe(true);
    expect(isPublicBlogPath("/blog/u/zhang_san/")).toBe(true);
    expect(isPublicBlogPath("/blog/tags/")).toBe(true);
  });
});

describe("isPublicBlogPath · 拦截（创作侧与审核侧）", () => {
  it("我的文章 / 新建 / 编辑 / 审核队列都不放行", () => {
    expect(isPublicBlogPath("/blog/me")).toBe(false);
    expect(isPublicBlogPath("/blog/new")).toBe(false);
    expect(isPublicBlogPath("/blog/clx0000000000000000000/edit")).toBe(false);
    expect(isPublicBlogPath("/blog/moderation")).toBe(false);
  });

  it("前缀判定不会误伤相邻路径（/blogx、/blog/tags-x）", () => {
    expect(isPublicBlogPath("/blogx")).toBe(false);
    expect(isPublicBlogPath("/blog/tags-x")).toBe(false);
    expect(isPublicBlogPath("/blog/post/1")).toBe(false);
  });

  it("平台其他板块一律不放行", () => {
    for (const p of ["/", "/dashboard", "/tasks", "/habits", "/settings", "/links", "/api/health"]) {
      expect(isPublicBlogPath(p), p).toBe(false);
    }
  });
});

describe("public-routes 注册表", () => {
  it("isPublicPath 与博客判定一致（注册表是 middleware 的唯一输入）", () => {
    for (const p of ["/blog", "/blog/p/x", "/blog/me", "/tasks"]) {
      expect(isPublicPath(p)).toBe(isPublicBlogPath(p));
    }
  });

  it("爬虫基础设施对无 Cookie 请求放行（M8 冒烟回归：曾 302 到 /login 导致整站 SEO 失效）", () => {
    expect(isPublicPath("/robots.txt")).toBe(true);
    expect(isPublicPath("/sitemap.xml")).toBe(true);
    // 相邻路径不误伤
    expect(isPublicPath("/robots.txt-x")).toBe(false);
    expect(isPublicPath("/sitemap")).toBe(false);
  });

  it("常量表非空 —— 防止常量被误删导致防线静默消失", () => {
    expect(__publicBlogRouteTable.exact.length).toBeGreaterThan(0);
    expect(__publicBlogRouteTable.prefixes.length).toBeGreaterThan(0);
    for (const prefix of __publicBlogRouteTable.prefixes) {
      expect(prefix.endsWith("/"), `${prefix} 必须以 / 结尾，否则会误伤相邻路径`).toBe(true);
    }
  });
});
