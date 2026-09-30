import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { createPostService } from "@/modules/blog/services/post.service";
import { PostNotAccessibleError } from "@/lib/errors";
import { loadOgFont } from "@/modules/blog/lib/og-font";
import { truncate } from "@/modules/blog/lib/format";

/**
 * 文章 OG 动态图 `/blog/p/[slug]/og`（PRD §5.9 第三级回退：标题+作者+主题色）。
 *
 * 生成时机：ogImage / coverImage 都为空时，详情页 metadata 的 og:image 才
 * 指向本路由（见 lib/seo.ts resolveOgImageUrl）。社交平台抓取 OG 图时会
 * 带 UA 直取本 URL，因此无需登录（middleware 已按 /blog/p/ 前缀放行）。
 *
 * 可见性：以公开视角读文章（userId: null），不可访问 → 404 —— 与详情页
 * 同一口径：不泄漏"存在但无权"。
 *
 * 主题色：OG 图是"发给站外"的静态位图，无法跟随站内 6 主题切换，
 * 取默认主题（classic-paper）的主色做强调、深底做画布——与站内代码块
 * 配色同一设计语言。
 */
export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let title: string;
  let author: string;
  let dateText: string;
  try {
    const { post } = await createPostService().getBySlug(slug, { userId: null });
    title = post.title;
    author = post.author.displayName ?? post.author.username;
    dateText = post.publishedAt ? post.publishedAt.slice(0, 10) : "";
  } catch (err) {
    if (err instanceof PostNotAccessibleError) return new NextResponse(null, { status: 404 });
    throw err;
  }

  const font = await loadOgFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: "#14181f",
          backgroundImage: "linear-gradient(135deg, #14181f 0%, #262f3f 100%)",
          color: "#f2efe8",
        }}
      >
        {/* 顶部：主题色强调条 + 站点名 */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 10, backgroundColor: "#c9a36a", borderRadius: 5 }} />
          <div style={{ fontSize: 26, color: "#b7ab93" }}>个人数字工作台</div>
        </div>

        {/* 标题：最多 3 行，超出省略 */}
        <div
          style={{
            display: "flex",
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.25,
            lineClamp: 3,
          }}
        >
          {truncate(title, 60)}
        </div>

        {/* 底部：作者 + 日期 */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 30, color: "#b7ab93" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: "#c9a36a",
                color: "#14181f",
                fontSize: 26,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {author.slice(0, 1)}
            </div>
            <div>{author}</div>
          </div>
          {dateText && <div>{dateText}</div>}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      // 仅在探测到 CJK 字体时注入（否则用内置拉丁字体，中文降级为缺字形）
      ...(font ? { fonts: [{ name: "cjk", data: font, weight: 400, style: "normal" }] } : {}),
    },
  );
}
