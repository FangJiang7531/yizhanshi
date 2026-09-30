import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostService } from "@/modules/blog/services/post.service";
import {
  ConflictError,
  ContentRejectedError,
  PostNotAccessibleError,
  SlugConflictError,
} from "@/lib/errors";
import { prisma, resetDb, setupTestDb } from "./helpers/db";
import { createPost, createUser, seedBlogSensitiveWords, seedVisibilityMatrix } from "./helpers/blog";

/**
 * 文章服务层集成测试（制作流程 Gate 3.1 / 3.2 / 3.3）。
 *
 * 每个用例前清库 + 重灌敏感词库 —— 后者不能省：词库空载会让审核静默失效，
 * 测试会"假绿"（这正是本文件专门覆盖 XSS / BLOCK / REVIEW 的原因）。
 */
const service = createPostService();

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await resetDb();
  await seedBlogSensitiveWords();
});

describe("Gate 3.1 · getBySlug 可见性矩阵", () => {
  it("他人草稿/私密/待审/归档一律抛 PostNotAccessibleError（404 语义，不是 403，C-01）", async () => {
    const author = await createUser("USER", "author");
    const stranger = await createUser("USER", "stranger");
    const ids = await seedVisibilityMatrix(author.id);

    const blocked = ["p02-draft", "p03-review", "p04-rejected", "p06-private", "p07-archived"];
    for (const slug of blocked) {
      await expect(
        service.getBySlug(slug, { userId: stranger.id }),
        `${slug} 应 404`,
      ).rejects.toBeInstanceOf(PostNotAccessibleError);
      // 未登录访客同样 404
      await expect(service.getBySlug(slug, { userId: null }), `${slug} 访客应 404`).rejects.toBeInstanceOf(
        PostNotAccessibleError,
      );
    }
    expect(ids["p02-draft"]).toBeTruthy(); // 确保夹具确实建了数据
  });

  it("公开域文章：公众与作者都可读，但只有作者 canEdit", async () => {
    const author = await createUser("USER", "author");
    const stranger = await createUser("USER", "stranger");
    await createPost(author.id, { slug: "public-post", title: "公开文章" });

    const asStranger = await service.getBySlug("public-post", { userId: stranger.id });
    expect(asStranger.isAuthor).toBe(false);
    expect(asStranger.canEdit).toBe(false);
    expect(asStranger.isAuthorView).toBe(false);
    expect(asStranger.post.status).toBe("PUBLISHED");

    const asAuthor = await service.getBySlug("public-post", { userId: author.id });
    expect(asAuthor.isAuthor).toBe(true);
    expect(asAuthor.canEdit).toBe(true);
  });

  it("作者访问自己的草稿：返回内容 + canEdit + 作者视角标记（用于 noindex）", async () => {
    const author = await createUser("USER", "author");
    await createPost(author.id, {
      slug: "my-draft",
      title: "我的草稿",
      contentMd: "还没写完的正文",
      status: "DRAFT",
      auditStatus: "PENDING",
      publishedAt: null,
    });

    const res = await service.getBySlug("my-draft", { userId: author.id });
    expect(res.isAuthorView).toBe(true);
    expect(res.canEdit).toBe(true);
    expect("contentMd" in res.post).toBe(true);
  });

  it("UNLISTED 可直达但不进列表（PRD §3.2 最容易做错的一格）", async () => {
    const author = await createUser("USER", "author");
    await createPost(author.id, { slug: "unlisted", title: "不列出", visibility: "UNLISTED" });

    const direct = await service.getBySlug("unlisted", { userId: null });
    expect(direct.post.visibility).toBe("UNLISTED");

    const list = await service.listPublic({ tab: "latest", take: 20 });
    expect(list.items.map((i) => i.slug)).not.toContain("unlisted");
  });

  it("PRIVATE 直达也是 404（仅作者可看）", async () => {
    const author = await createUser("USER", "author");
    await createPost(author.id, { slug: "secret", title: "私密", visibility: "PRIVATE" });

    await expect(service.getBySlug("secret", { userId: null })).rejects.toBeInstanceOf(PostNotAccessibleError);
    const mine = await service.getBySlug("secret", { userId: author.id });
    expect(mine.isAuthorView).toBe(true);
  });
});

describe("Gate 3.2 · slug 生成与稳定性", () => {
  it("连续创建 3 篇同标题文章，slug 为 x / x-2 / x-3（B-01）", async () => {
    const user = await createUser();

    const a = await service.saveDraft(user.id, { title: "hello", contentMd: "1" });
    const b = await service.saveDraft(user.id, { title: "hello", contentMd: "2" });
    const c = await service.saveDraft(user.id, { title: "hello", contentMd: "3" });

    expect(a.post.slug).toBe("hello");
    expect(b.post.slug).toBe("hello-2");
    expect(c.post.slug).toBe("hello-3");
  });

  it("纯中文标题走时间戳策略，满足 slug 正则（B-01 变体）", async () => {
    const user = await createUser();
    const res = await service.saveDraft(user.id, { title: "我的第一篇文章", contentMd: "正文" });
    expect(res.post.slug).toMatch(/^[a-z0-9-]{3,80}$/);
    expect(res.post.slug.startsWith("post-")).toBe(true);
  });

  it("改标题不自动改 slug（B-03）", async () => {
    const user = await createUser();
    const created = await service.saveDraft(user.id, { title: "original-title", contentMd: "正文" });
    expect(created.post.slug).toBe("original-title");

    const updated = await service.saveDraft(user.id, { id: created.post.id, title: "完全换了个标题", contentMd: "正文" });
    expect(updated.post.slug).toBe("original-title");
  });

  it("显式 updateSlug：校验格式与全局唯一", async () => {
    const user = await createUser();
    const a = await service.saveDraft(user.id, { title: "first-post", contentMd: "正文" });
    const b = await service.saveDraft(user.id, { title: "second-post", contentMd: "正文" });

    await expect(service.updateSlug(user.id, b.post.id, "first-post")).rejects.toBeInstanceOf(SlugConflictError);
    await expect(service.updateSlug(user.id, b.post.id, "AB")).rejects.toBeInstanceOf(SlugConflictError);

    const ok = await service.updateSlug(user.id, b.post.id, "brand-new-slug");
    expect(ok.newSlug).toBe("brand-new-slug");
    expect(ok.oldSlug).toBe("second-post");
    expect(a.post.id).not.toBe(b.post.id);
  });
});

describe("Gate 3.3 · 发布流程与审核门禁", () => {
  it("标题含 REVIEW 级词 → status=REVIEW / auditStatus=PENDING，且不出现在公开列表（Gate 3.3-1）", async () => {
    const user = await createUser();
    const draft = await service.saveDraft(user.id, { title: "测试待审词：标题示例", contentMd: "正常正文" });

    const result = await service.publish(user.id, {
      id: draft.post.id,
      title: "测试待审词：标题示例",
      contentMd: "正常正文",
      tagNames: [],
      visibility: "PUBLIC",
      allowComment: true,
      allowRepost: true,
    });

    expect(result.status).toBe("REVIEW");
    expect(result.auditStatus).toBe("PENDING");
    expect(result.hits.some((h) => h.field === "title")).toBe(true);

    const list = await service.listPublic({ tab: "latest", take: 20 });
    expect(list.items.map((i) => i.slug)).not.toContain(draft.post.slug);
    await expect(service.getBySlug(draft.post.slug, { userId: null })).rejects.toBeInstanceOf(
      PostNotAccessibleError,
    );
  });

  it("正文含 BLOCK 级词 → 抛 ContentRejectedError 且数据库无变更（Gate 3.3-2）", async () => {
    const user = await createUser();
    const draft = await service.saveDraft(user.id, { title: "正常标题", contentMd: "正常正文" });
    const before = await prisma.blogPost.findUniqueOrThrow({ where: { id: draft.post.id } });

    await expect(
      service.publish(user.id, {
        id: draft.post.id,
        title: "正常标题",
        contentMd: "这里包含测试违禁词",
        tagNames: [],
        visibility: "PUBLIC",
        allowComment: true,
        allowRepost: true,
      }),
    ).rejects.toBeInstanceOf(ContentRejectedError);

    const after = await prisma.blogPost.findUniqueOrThrow({ where: { id: draft.post.id } });
    expect(after.status).toBe(before.status);
    expect(after.contentMd).toBe(before.contentMd);
    expect(after.publishedAt).toEqual(before.publishedAt);
    // 审核流水不应留下"已提交"记录
    expect(await prisma.auditRecord.count({ where: { targetId: draft.post.id } })).toBe(0);
  });

  it("MASK 级词被替换为 *** 后放行（PRD §6.2）", async () => {
    const user = await createUser();
    const draft = await service.saveDraft(user.id, { title: "正常标题", contentMd: "联系方式：加微信" });

    const result = await service.publish(user.id, {
      id: draft.post.id,
      title: "正常标题",
      contentMd: "联系方式：加微信",
      tagNames: [],
      visibility: "PUBLIC",
      allowComment: true,
      allowRepost: true,
    });

    expect(result.status).toBe("PUBLISHED");
    expect(result.post.contentMd).not.toContain("加微信");
    expect(result.post.contentMd).toContain("***");
  });

  it("XSS 载荷发布后不产生可执行标签（Gate 3.3-3 / B-11 / B-12）", async () => {
    const user = await createUser();

    const p1 = await service.saveDraft(user.id, { title: "脚本注入", contentMd: "<script>alert(1)</script>" });
    const r1 = await service.publish(user.id, {
      id: p1.post.id,
      title: "脚本注入",
      contentMd: "<script>alert(1)</script>",
      tagNames: [],
      visibility: "PUBLIC",
      allowComment: true,
      allowRepost: true,
    });
    const html1 = r1.post.contentHtml ?? "";
    // 安全判据是"不存在可执行标签"，而非"文本里不出现这几个字母"：
    // 载荷被降级为纯文本后会带实体前缀（&#x3C; / &lt;），这是安全的展示形式。
    expect(html1).not.toMatch(/<script[\s>]/i);
    expect(html1).toMatch(/&#x3C;script|&lt;script/);

    const p2 = await service.saveDraft(user.id, { title: "图片注入", contentMd: '<img src=x onerror=alert(1)>' });
    const r2 = await service.publish(user.id, {
      id: p2.post.id,
      title: "图片注入",
      contentMd: '<img src=x onerror=alert(1)>',
      tagNames: [],
      visibility: "PUBLIC",
      allowComment: true,
      allowRepost: true,
    });
    const html2 = r2.post.contentHtml ?? "";
    // 不存在"带 onerror 的真实 <img> 标签"
    expect(html2).not.toMatch(/<img[^>]*onerror/i);
    expect(html2).not.toMatch(/<img[\s>]/i);
  });

  it("重复发布同一篇文章，publishedAt 不被更新（B-02）", async () => {
    const user = await createUser();
    const draft = await service.saveDraft(user.id, { title: "publish-twice", contentMd: "正文" });
    const payload = {
      id: draft.post.id,
      title: "publish-twice",
      contentMd: "正文",
      tagNames: [],
      visibility: "PUBLIC" as const,
      allowComment: true,
      allowRepost: true,
    };

    const first = await service.publish(user.id, payload);
    const firstPublishedAt = first.post.publishedAt;
    expect(firstPublishedAt).not.toBeNull();

    // 等一下再发一次，确保时间戳若被更新则必然不同
    await new Promise((r) => setTimeout(r, 15));
    const second = await service.publish(user.id, { ...payload, contentMd: "改过的正文" });

    expect(second.post.publishedAt).toBe(firstPublishedAt);
    expect(second.post.contentMd).toBe("改过的正文");
  });

  it("发布同时写入标签（POST 域）与审核流水", async () => {
    const user = await createUser();
    const draft = await service.saveDraft(user.id, { title: "with-tags", contentMd: "正文" });

    const result = await service.publish(user.id, {
      id: draft.post.id,
      title: "with-tags",
      contentMd: "正文",
      tagNames: ["效率", "方法论", "效率"],
      visibility: "PUBLIC",
      allowComment: true,
      allowRepost: true,
    });

    expect(new Set(result.post.tags.map((t) => t.name))).toEqual(new Set(["效率", "方法论"]));
    expect(await prisma.tag.count({ where: { userId: user.id, scope: "POST" } })).toBe(2);
    expect(await prisma.tag.count({ where: { userId: user.id, scope: "TASK" } })).toBe(0);
    expect(await prisma.auditRecord.count({ where: { targetId: draft.post.id } })).toBe(1);
  });

  it("发布时服务端 Zod 拦截非法输入（C-06）", async () => {
    const user = await createUser();
    const draft = await service.saveDraft(user.id, { title: "ok", contentMd: "正文" });

    // 空正文
    await expect(
      service.publish(user.id, {
        id: draft.post.id,
        title: "ok",
        contentMd: "",
        tagNames: [],
        visibility: "PUBLIC",
        allowComment: true,
        allowRepost: true,
      }),
    ).rejects.toThrow();

    // 非法可见性
    await expect(
      service.publish(user.id, {
        id: draft.post.id,
        title: "ok",
        contentMd: "正文",
        tagNames: [],
        // @ts-expect-error 故意构造非法枚举，验证服务端拒绝
        visibility: "EVERYONE",
        allowComment: true,
        allowRepost: true,
      }),
    ).rejects.toThrow();
  });

  it("他人文章的 publish / archive / softDelete 全部失败（C-02）", async () => {
    const author = await createUser("USER", "author");
    const intruder = await createUser("USER", "intruder");
    const post = await createPost(author.id, { slug: "others", title: "他人的文章" });

    await expect(
      service.publish(intruder.id, {
        id: post.id,
        title: "篡改",
        contentMd: "篡改",
        tagNames: [],
        visibility: "PUBLIC",
        allowComment: true,
        allowRepost: true,
      }),
    ).rejects.toBeInstanceOf(PostNotAccessibleError);

    await expect(service.archive(intruder.id, post.id)).rejects.toBeInstanceOf(PostNotAccessibleError);
    await expect(service.softDelete(intruder.id, post.id)).rejects.toBeInstanceOf(PostNotAccessibleError);

    const after = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(after.title).toBe("他人的文章");
    expect(after.deletedAt).toBeNull();
  });
});

describe("草稿行为", () => {
  it("自动保存可反复覆盖，且改写 wordCount / readingMinutes", async () => {
    const user = await createUser();
    const first = await service.saveDraft(user.id, { title: "draft", contentMd: "短" });
    expect(first.post.readingMinutes).toBe(1);

    const second = await service.saveDraft(user.id, {
      id: first.post.id,
      title: "draft",
      contentMd: "打".repeat(5000),
    });
    expect(second.post.wordCount).toBe(5000);
    expect(second.post.readingMinutes).toBe(13); // B-13：5000/400 向上取整
  });

  it("baseUpdatedAt 不匹配 → 抛 ConflictError（A-04 双标签页不静默覆盖）", async () => {
    const user = await createUser();
    const created = await service.saveDraft(user.id, { title: "conflict", contentMd: "第一版" });
    const staleTimestamp = created.post.updatedAt;

    // 模拟另一个标签页先保存了
    await new Promise((r) => setTimeout(r, 15));
    await service.saveDraft(user.id, { id: created.post.id, title: "conflict", contentMd: "第二版（另一个标签页）" });

    await expect(
      service.saveDraft(user.id, {
        id: created.post.id,
        title: "conflict",
        contentMd: "第三版（本标签页，基于过期快照）",
        baseUpdatedAt: staleTimestamp,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // 内容未被静默覆盖
    const after = await prisma.blogPost.findUniqueOrThrow({ where: { id: created.post.id } });
    expect(after.contentMd).toBe("第二版（另一个标签页）");
  });

  it("归档后从公开域消失，取消归档回到草稿而非直接复活", async () => {
    const user = await createUser();
    const draft = await service.saveDraft(user.id, { title: "archivable", contentMd: "正文" });
    await service.publish(user.id, {
      id: draft.post.id,
      title: "archivable",
      contentMd: "正文",
      tagNames: [],
      visibility: "PUBLIC",
      allowComment: true,
      allowRepost: true,
    });
    expect((await service.listPublic({ tab: "latest", take: 20 })).items).toHaveLength(1);

    const archived = await service.archive(user.id, draft.post.id);
    expect(archived.status).toBe("ARCHIVED");
    expect((await service.listPublic({ tab: "latest", take: 20 })).items).toHaveLength(0);

    const back = await service.unarchive(user.id, draft.post.id);
    expect(back.status).toBe("DRAFT"); // 不直接回到 PUBLISHED，必须重新走发布审核
    expect((await service.listPublic({ tab: "latest", take: 20 })).items).toHaveLength(0);
  });

  it("软删除后作者列表与公开域都不可见", async () => {
    const user = await createUser();
    const draft = await service.saveDraft(user.id, { title: "deletable", contentMd: "正文" });
    await service.softDelete(user.id, draft.post.id);

    const list = await service.listMine(user.id, { take: 20 });
    expect(list.items).toHaveLength(0);
    await expect(service.getBySlug(draft.post.slug, { userId: user.id })).rejects.toBeInstanceOf(
      PostNotAccessibleError,
    );
  });

  it("mineStats 统计各状态数量与总阅读（/blog/me 页头）", async () => {
    const user = await createUser();
    const a = await service.saveDraft(user.id, { title: "s1", contentMd: "正文" });
    const b = await service.saveDraft(user.id, { title: "s2", contentMd: "正文" });
    const c = await service.saveDraft(user.id, { title: "s3", contentMd: "正文" });

    await service.publish(user.id, {
      id: c.post.id,
      title: "s3",
      contentMd: "正文",
      tagNames: [],
      visibility: "PUBLIC",
      allowComment: true,
      allowRepost: true,
    });
    await service.archive(user.id, b.post.id);
    await prisma.blogPost.update({ where: { id: c.post.id }, data: { viewCount: 42 } });
    expect(a.post.id).toBeTruthy();

    const stats = await service.mineStats(user.id);
    expect(stats.draft).toBe(1);
    expect(stats.archived).toBe(1);
    expect(stats.published).toBe(1);
    expect(stats.totalViews).toBe(42);
  });
});
