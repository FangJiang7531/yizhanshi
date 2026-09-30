import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostService } from "@/modules/blog/services/post.service";
import { PostNotAccessibleError } from "@/lib/errors";
import { prisma, resetDb, setupTestDb } from "./helpers/db";
import { createPost, createUser, seedBlogSensitiveWords, seedVisibilityMatrix } from "./helpers/blog";

/**
 * 公开侧页面的数据契约集成测试（制作流程 Gate 5.1 / 5.4）。
 *
 * 页面本身是 RSC，断言 DOM 需要 E2E（M11）；这里断言的是**页面依赖的服务层输出**：
 * 列表里到底有哪些文章、直达位能不能打开、标签有没有跨域泄漏、静态化候选集是否正确。
 * 把这一层锁死，页面就只是"把数据画出来"，不会再出现可见性错误。
 *
 * ⚠️ 关于 Gate 5.1「展示 P-01 / P-05」的解读：
 * PRD §3.2 的可见性矩阵明确写着 UNLISTED 在**列表/聚合位为 ❌、直达位为 ✅**
 * （并把"UNLISTED 与 PRIVATE 的区别"标为本期最容易做错的一处）。因此
 * 「展示 P-01 / P-05」只可能指"两者都能通过直达链接访问"，而不是"都进列表"。
 * 本文件按 PRD §3.2 断言，两者都覆盖。
 */
const service = createPostService();

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await resetDb();
  await seedBlogSensitiveWords();
});

describe("Gate 5.1 · 发现页列表", () => {
  it("列表只含 P-01（PUBLIC）；UNLISTED / PRIVATE / 草稿 / 待审 / 驳回 / 归档 / 已删全部不出现", async () => {
    const author = await createUser("USER", "author");
    await seedVisibilityMatrix(author.id);

    const { items } = await service.listPublic({ tab: "latest", take: 20 });
    expect(items.map((i) => i.slug)).toEqual(["p01-published-public"]);
  });

  it("直达位：P-01 与 P-05 可访问，其余（含 PRIVATE）抛 404 语义", async () => {
    const author = await createUser("USER", "author");
    await seedVisibilityMatrix(author.id);

    for (const slug of ["p01-published-public", "p05-unlisted"]) {
      const res = await service.getBySlug(slug, { userId: null });
      expect(res.post.slug, slug).toBe(slug);
      expect(res.isAuthorView, `${slug} 不应走作者视角`).toBe(false);
    }

    for (const slug of ["p02-draft", "p03-review", "p04-rejected", "p06-private", "p07-archived"]) {
      await expect(service.getBySlug(slug, { userId: null }), slug).rejects.toBeInstanceOf(
        PostNotAccessibleError,
      );
    }
  });

  it("列表不含正文（避免把大字段传过 RSC 边界）", async () => {
    const author = await createUser("USER", "author");
    await createPost(author.id, { slug: "long-post", title: "长文", contentMd: "正文".repeat(500) });

    const { items } = await service.listPublic({ tab: "latest", take: 5 });
    expect(items).toHaveLength(1);
    expect(Object.keys(items[0]!)).not.toContain("contentHtml");
    expect(Object.keys(items[0]!)).not.toContain("contentMd");
  });

  it("tab=hot 按点赞降序（Gate 5.1 判据 2）", async () => {
    const author = await createUser("USER", "author");
    const a = await createPost(author.id, { slug: "hot-a", title: "A" });
    const b = await createPost(author.id, { slug: "hot-b", title: "B" });
    const c = await createPost(author.id, { slug: "hot-c", title: "C" });
    await prisma.blogPost.update({ where: { id: a.id }, data: { likeCount: 1 } });
    await prisma.blogPost.update({ where: { id: b.id }, data: { likeCount: 9 } });
    await prisma.blogPost.update({ where: { id: c.id }, data: { likeCount: 5 } });

    const { items } = await service.listPublic({ tab: "hot", take: 10 });
    expect(items.map((i) => i.slug)).toEqual(["hot-b", "hot-c", "hot-a"]);
  });
});

describe("Gate 5.4 · 作者主页", () => {
  it("仅展示该作者的 PUBLIC 已发布文章，UNLISTED 与 PRIVATE 都不进列表", async () => {
    const author = await createUser("USER", "author");
    const other = await createUser("USER", "other");
    await seedVisibilityMatrix(author.id);
    await createPost(other.id, { slug: "other-public", title: "别人的公开文章" });

    const { items, stats } = await service.listByAuthor(author.username, { take: 20 });
    expect(items.map((i) => i.slug)).toEqual(["p01-published-public"]);
    expect(items.every((i) => i.author.username === author.username)).toBe(true);

    // 统计口径必须与列表一致：只算公开可见的文章
    expect(stats.postCount).toBe(1);
  });

  it("不存在的用户名返回空列表与零统计（页面据此渲染空状态）", async () => {
    const { items, stats } = await service.listByAuthor("no_such_user", { take: 20 });
    expect(items).toEqual([]);
    expect(stats.postCount).toBe(0);
  });
});

describe("Gate 5.4 · 标签归档与标签域隔离", () => {
  it("标签归档分页：30 篇 → 首页 20 条 + 游标，次页 10 条且无游标", async () => {
    const author = await createUser("USER", "author");
    for (let i = 0; i < 30; i++) {
      await createPost(author.id, {
        slug: `series-${String(i).padStart(2, "0")}`,
        title: `连载第 ${i} 篇`,
        tags: ["连载"],
        publishedAt: new Date(Date.now() - (30 - i) * 60_000),
      });
    }

    const first = await service.listByTag("连载", { take: 20 });
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.listByTag("连载", { take: 20, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(10);
    expect(second.nextCursor).toBeNull();

    // 两页无重叠、无遗漏
    const all = new Set([...first.items, ...second.items].map((i) => i.slug));
    expect(all.size).toBe(30);
  });

  it("任务标签不出现在博客标签云（Gate 5.4 判据 3 · scope 隔离）", async () => {
    const author = await createUser("USER", "author");
    await createPost(author.id, { slug: "tagged-post", title: "带标签的文章", tags: ["效率"] });

    // 同一个人同时拥有一个任务域标签和一个只挂在草稿上的 POST 域标签
    await prisma.tag.create({
      data: { userId: author.id, scope: "TASK", name: "任务标签", color: "#0EA5E9" },
    });
    await prisma.tag.create({
      data: { userId: author.id, scope: "POST", name: "孤立博客标签", color: "#8B5CF6" },
    });

    const tags = await service.listPublicTags();
    const names = tags.map((t) => t.name);
    expect(names).toContain("效率");
    expect(names).not.toContain("任务标签"); // 跨域泄漏
    expect(names).not.toContain("孤立博客标签"); // 没有任何公开文章引用 → 不进标签云
  });

  it("同名但不同域的标签互不影响（唯一约束是 userId+scope+name）", async () => {
    const author = await createUser("USER", "author");
    await prisma.tag.createMany({
      data: [
        { userId: author.id, scope: "TASK", name: "复盘", color: "#0EA5E9" },
        { userId: author.id, scope: "POST", name: "复盘", color: "#8B5CF6" },
      ],
    });
    await createPost(author.id, { slug: "retro", title: "复盘", tags: ["复盘"] });

    const tags = await service.listPublicTags();
    expect(tags.filter((t) => t.name === "复盘")).toHaveLength(1);
    expect(tags.find((t) => t.name === "复盘")!.postCount).toBe(1);
  });
});

describe("详情页数据（Step 5.2）", () => {
  it("详情带 contentHtml 与 toc，且 toc 只含 h2/h3", async () => {
    const author = await createUser("USER", "author");
    await createPost(author.id, {
      slug: "with-toc",
      title: "带目录的文章",
      contentMd: ["# 一级标题（不进目录）", "段落", "## 第二节", "内容", "### 第三节", "内容"].join("\n\n"),
    });

    const { post } = await service.getBySlug("with-toc", { userId: null });
    expect(post.contentHtml).toContain("<h2");
    expect(post.toc.map((t) => t.depth)).toEqual([2, 3]);
    expect(post.toc.map((t) => t.text)).toEqual(["第二节", "第三节"]);
    expect(post.toc.every((t) => t.id.length > 0)).toBe(true);
    // 目录 id 必须真的能在 HTML 里找到，否则点击跳转是空的
    for (const item of post.toc) {
      expect(post.contentHtml).toContain(`id="${item.id}"`);
    }
  });

  it("代码块被包在 .blog-code 容器里（复制按钮不能随代码横向滚动）", async () => {
    const author = await createUser("USER", "author");
    await createPost(author.id, {
      slug: "with-code",
      title: "带代码的文章",
      contentMd: "```ts\nconst a = 1;\n```",
    });

    const { post } = await service.getBySlug("with-code", { userId: null });
    expect(post.contentHtml).toMatch(/<div class="blog-code"><pre>/);
  });
});

describe("静态化候选集（SSG）", () => {
  it("详情页候选集只含公开可列出文章，且去重", async () => {
    const author = await createUser("USER", "author");
    await seedVisibilityMatrix(author.id);

    const params = await service.listStaticParams();
    const slugs = params.map((p) => p.slug);
    expect(slugs).toEqual(["p01-published-public"]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("同一篇同时命中『最新』与『热门』时只出现一次", async () => {
    const author = await createUser("USER", "author");
    const p = await createPost(author.id, { slug: "both-lists", title: "两条路都命中" });
    await prisma.blogPost.update({ where: { id: p.id }, data: { likeCount: 100, viewCount: 100 } });

    const slugs = (await service.listStaticParams()).map((x) => x.slug);
    expect(slugs.filter((s) => s === "both-lists")).toHaveLength(1);
  });

  it("作者与标签候选集只含有公开内容的条目", async () => {
    const author = await createUser("USER", "author");
    const silent = await createUser("USER", "silent");
    await createPost(author.id, { slug: "public-one", title: "公开", tags: ["序"] });
    // 该作者只有草稿 → 不应进入作者页预渲染集合
    await createPost(silent.id, { slug: "draft-one", title: "草稿", status: "DRAFT", publishedAt: null });

    const authors = (await service.listAuthorStaticParams()).map((a) => a.username);
    expect(authors).toContain(author.username);
    expect(authors).not.toContain(silent.username);

    const tags = (await service.listTagStaticParams()).map((t) => t.tag);
    expect(tags).toEqual(["序"]);
  });
});
