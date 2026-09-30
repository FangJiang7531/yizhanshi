import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCommentService } from "@/modules/blog/services/comment.service";
import { createSearchService, buildSnippet } from "@/modules/blog/services/search.service";
import { CommentDisabledError, ContentRejectedError, RateLimitError } from "@/lib/errors";
import { prisma, resetDb, setupTestDb } from "./helpers/db";
import { createPost, createUser, seedBlogSensitiveWords } from "./helpers/blog";

/**
 * 评论与搜索服务集成测试（制作流程 Gate 3.4）。
 * 覆盖：两级树组装、评论关闭、限流、反广告、审核、软删占位、
 * 以及搜索的可见性过滤与高亮安全。
 */
const commentService = createCommentService();
const searchService = createSearchService();

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await resetDb();
  await seedBlogSensitiveWords();
});

describe("Gate 3.4 · 评论两级树", () => {
  it("列表返回两级树：顶层含 replies，且不存在三级嵌套（Gate 3.4-1 / A-12）", async () => {
    const author = await createUser("USER", "author");
    const u1 = await createUser("USER", "u1");
    const u2 = await createUser("USER", "u2");
    const u3 = await createUser("USER", "u3");
    const post = await createPost(author.id, { slug: "post", title: "文章" });

    const top = await commentService.create(u1.id, { postId: post.id, content: "顶层评论" }, { isAdmin: false });
    const reply = await commentService.create(
      u2.id,
      { postId: post.id, parentId: top.id, content: "一级回复" },
      { isAdmin: false },
    );
    // 对"回复"再回复 → 应被上提到顶层
    const deep = await commentService.create(
      u3.id,
      { postId: post.id, parentId: reply.id, content: "回复的回复" },
      { isAdmin: false },
    );

    const list = await commentService.list(post.id, { userId: null, isAdmin: false }, { sort: "new" });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.id).toBe(top.id);
    expect(list.items[0]?.replies).toHaveLength(2);
    // 深度恒为 2：回复下面不可能再有回复
    for (const r of list.items[0]?.replies ?? []) {
      expect(r.replies).toHaveLength(0);
    }
    expect(deep.id).toBeTruthy();
    expect(new Set(list.items[0]?.replies.map((r) => r.id))).toEqual(new Set([reply.id, deep.id]));
  });

  it("allowComment=false 的文章抛 COMMENT_DISABLED（Gate 3.4-2 / A-13）", async () => {
    const author = await createUser("USER", "author");
    const commenter = await createUser("USER", "commenter");
    const post = await createPost(author.id, { slug: "no-comment", title: "关评文章", allowComment: false });

    await expect(
      commentService.create(commenter.id, { postId: post.id, content: "想说点什么" }, { isAdmin: false }),
    ).rejects.toBeInstanceOf(CommentDisabledError);
  });

  it("对不可见文章（草稿/私密/已删）评论一律 404", async () => {
    const author = await createUser("USER", "author");
    const commenter = await createUser("USER", "commenter");
    const draft = await createPost(author.id, {
      slug: "draft",
      title: "草稿",
      status: "DRAFT",
      auditStatus: "PENDING",
      publishedAt: null,
    });

    await expect(
      commentService.create(commenter.id, { postId: draft.id, content: "评论草稿" }, { isAdmin: false }),
    ).rejects.toThrow("文章不存在");
  });

  it("评论软删除后保留占位并抹去内容（A-12）", async () => {
    const author = await createUser("USER", "author");
    const post = await createPost(author.id, { slug: "post", title: "文章" });
    const c = await commentService.create(
      author.id,
      { postId: post.id, content: "这条会被删掉" },
      { isAdmin: false },
    );

    await commentService.remove(author.id, c.id, { isAdmin: false });

    const list = await commentService.list(post.id, { userId: null, isAdmin: false }, { sort: "new" });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.deleted).toBe(true);
    expect(list.items[0]?.content).toBe("");
    expect(list.items[0]?.contentHtml).toBe("");
    // 占位仍占一个楼层（列表里有它），但计数与 commentCount 同口径 —— 不含占位
    expect(list.total).toBe(0);
    const fresh = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(fresh.commentCount).toBe(0);
  });

  it("评论内容含 BLOCK 词被拒（审核六个入口之评论）", async () => {
    const author = await createUser("USER", "author");
    const post = await createPost(author.id, { slug: "post", title: "文章" });
    await expect(
      commentService.create(author.id, { postId: post.id, content: "这是测试违禁词" }, { isAdmin: false }),
    ).rejects.toBeInstanceOf(ContentRejectedError);
  });

  it("评论含 REVIEW 词 → 进入待审，不出现在列表", async () => {
    const author = await createUser("USER", "author");
    const post = await createPost(author.id, { slug: "post", title: "文章" });
    const created = await commentService.create(
      author.id,
      { postId: post.id, content: "含测试待审词的内容" },
      { isAdmin: false },
    );

    expect(created.status).toBe("PENDING");
    const list = await commentService.list(post.id, { userId: null, isAdmin: false }, { sort: "new" });
    expect(list.items).toHaveLength(0);
  });

  it("单条评论超过 2 个链接被拒（C-08 反广告）", async () => {
    const author = await createUser("USER", "author");
    const post = await createPost(author.id, { slug: "post", title: "文章" });
    await expect(
      commentService.create(
        author.id,
        { postId: post.id, content: "https://a.com https://b.com https://c.com" },
        { isAdmin: false },
      ),
    ).rejects.toBeInstanceOf(ContentRejectedError);
  });

  it("单用户单文章每分钟 10 条，第 11 条 429（C-08）", async () => {
    const author = await createUser("USER", "author");
    const spammer = await createUser("USER", "spammer");
    const post = await createPost(author.id, { slug: "post", title: "文章" });

    for (let i = 0; i < 10; i++) {
      await commentService.create(spammer.id, { postId: post.id, content: `第 ${i} 条` }, { isAdmin: false });
    }

    await expect(
      commentService.create(spammer.id, { postId: post.id, content: "第 11 条" }, { isAdmin: false }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("commentCount 随创建与删除同步（同事务，B-14 口径）", async () => {
    const author = await createUser("USER", "author");
    const post = await createPost(author.id, { slug: "post", title: "文章" });
    const c = await commentService.create(author.id, { postId: post.id, content: "评论" }, { isAdmin: false });

    let fresh = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(fresh.commentCount).toBe(1);

    await commentService.remove(author.id, c.id, { isAdmin: false });
    fresh = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(fresh.commentCount).toBe(0);
  });

  it("查看者的点赞状态与可删除判定正确返回", async () => {
    const author = await createUser("USER", "author");
    const viewer = await createUser("USER", "viewer");
    const post = await createPost(author.id, { slug: "post", title: "文章" });
    const c = await commentService.create(author.id, { postId: post.id, content: "评论" }, { isAdmin: false });
    await commentService.toggleLike(c.id, viewer.id);

    const list = await commentService.list(post.id, { userId: viewer.id, isAdmin: false }, { sort: "new" });
    expect(list.items[0]?.liked).toBe(true);
    expect(list.items[0]?.likeCount).toBe(1);
    expect(list.items[0]?.canDelete).toBe(false); // 不是本人也不是管理员

    const asAuthor = await commentService.list(post.id, { userId: author.id, isAdmin: false }, { sort: "new" });
    expect(asAuthor.items[0]?.canDelete).toBe(true);

    const asAdmin = await commentService.list(post.id, { userId: null, isAdmin: true }, { sort: "new" });
    expect(asAdmin.items[0]?.canDelete).toBe(true);
  });
});

describe("Gate 3.4 · 搜索", () => {
  it("命中标题/摘要/正文，且排除草稿（Gate 3.4-3 / A-14）", async () => {
    const author = await createUser("USER", "author");
    await createPost(author.id, { slug: "p-public", title: "打卡工作流", contentMd: "正文内容" });
    await createPost(author.id, { slug: "p-body", title: "另一篇", contentMd: "正文里也提到打卡" });
    await createPost(author.id, {
      slug: "p-draft",
      title: "打卡草稿",
      contentMd: "打卡",
      status: "DRAFT",
      auditStatus: "PENDING",
      publishedAt: null,
    });

    const res = await searchService.search("打卡", { take: 20 });
    const slugs = res.items.map((i) => i.slug);
    expect(slugs).toContain("p-public");
    expect(slugs).toContain("p-body");
    expect(slugs).not.toContain("p-draft");
  });

  it("搜索结果只含 PUBLISHED + PUBLIC（UNLISTED / PRIVATE 被排除，Gate 3.4-4）", async () => {
    const author = await createUser("USER", "author");
    await createPost(author.id, { slug: "s-public", title: "公开的分享" });
    await createPost(author.id, { slug: "s-unlisted", title: "不列出的分享", visibility: "UNLISTED" });
    await createPost(author.id, { slug: "s-private", title: "私密的分享", visibility: "PRIVATE" });
    await createPost(author.id, {
      slug: "s-review",
      title: "待审的分享",
      status: "REVIEW",
      auditStatus: "PENDING",
      publishedAt: null,
    });

    const res = await searchService.search("分享", { take: 20 });
    expect(res.items.map((i) => i.slug)).toEqual(["s-public"]);
  });

  it("标签名参与匹配", async () => {
    const author = await createUser("USER", "author");
    await createPost(author.id, { slug: "tagged", title: "一篇普通文章", tags: ["复盘方法论"] });

    const res = await searchService.search("复盘方法", { take: 20 });
    expect(res.items.map((i) => i.slug)).toEqual(["tagged"]);
  });

  it("不足 2 字符不触发搜索（PRD §5.7 触发条件）", async () => {
    const author = await createUser("USER", "author");
    await createPost(author.id, { slug: "p", title: "打个卡" });
    const res = await searchService.search("打", { take: 20 });
    expect(res.items).toEqual([]);
  });

  it("命中片段高亮且已转义（防二次 XSS）", async () => {
    const author = await createUser("USER", "author");
    await createPost(author.id, {
      slug: "p",
      title: "HTML 与打卡",
      contentMd: "正文",
      // 摘要里塞入 HTML，验证高亮片段不会把标签原样输出
      status: "PUBLISHED",
    });
    await prisma.blogPost.update({
      where: { slug: "p" },
      data: { excerpt: '<b>打卡</b> 与 <script>alert(1)</script>' },
    });

    const res = await searchService.search("打卡", { take: 20 });
    const snippet = res.items[0]?.snippetHtml ?? "";
    expect(snippet).toContain("<mark>打卡</mark>");
    expect(snippet).not.toMatch(/<script[\s>]/i);
    expect(snippet).toContain("&lt;b&gt;");
  });

  it("标题命中排在正文命中之前（权重排序）", async () => {
    const author = await createUser("USER", "author");
    const older = new Date(Date.now() - 5 * 86_400_000);
    await createPost(author.id, { slug: "title-hit", title: "效率提升", contentMd: "正文", publishedAt: older });
    await createPost(author.id, { slug: "body-hit", title: "别的标题", contentMd: "正文提到效率", publishedAt: new Date() });

    const res = await searchService.search("效率", { take: 20 });
    expect(res.items[0]?.slug).toBe("title-hit");
  });

  it("buildSnippet 是纯函数：无命中返回 null，长文截断补省略号", () => {
    expect(buildSnippet("无关内容", "打卡")).toBeNull();
    const long = `${"前".repeat(100)}打卡${"后".repeat(100)}`;
    const snippet = buildSnippet(long, "打卡")!;
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("<mark>打卡</mark>");
    // 前后各 40 字 + 标记
    expect(snippet.length).toBeLessThan(120);
  });

  it("搜索服务暴露可替换的 provider（SearchProvider 抽象）", () => {
    expect(searchService.provider).toBeDefined();
    expect(typeof searchService.provider.search).toBe("function");
  });
});
