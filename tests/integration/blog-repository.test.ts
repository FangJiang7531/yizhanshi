import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostRepository } from "@/modules/blog/repositories/post.repository";
import { createCommentRepository } from "@/modules/blog/repositories/comment.repository";
import { createInteractionRepository } from "@/modules/blog/repositories/interaction.repository";
import { createBlogTagRepository } from "@/modules/blog/repositories/tag-repository";
import { createTagRepository } from "@/modules/tasks/repositories/tag-repository";
import { prisma, resetDb, setupTestDb } from "./helpers/db";
import { createPost, createUser, seedVisibilityMatrix, type PostSpec } from "./helpers/blog";

/**
 * 博客仓储层集成测试（真实 PostgreSQL）。
 * 对应制作流程 Gate 2.1（可见性 / 越权）与 Gate 2.2（父级上提 / 幂等 / scope 隔离）。
 */
const postRepo = createPostRepository();
const commentRepo = createCommentRepository();
const interactionRepo = createInteractionRepository();
const blogTagRepo = createBlogTagRepository();
const taskTagRepo = createTagRepository();

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("Gate 2.1 · 作者域强制 userId", () => {
  it("用他人的 postId 调用 findMineById 返回 null（C-01/C-02 的结构性保障）", async () => {
    const owner = await createUser("USER", "owner");
    const intruder = await createUser("USER", "intruder");
    const post = await createPost(owner.id, { slug: "others-post", title: "他人的文章" });

    expect(await postRepo.findMineById(owner.id, post.id)).not.toBeNull();
    expect(await postRepo.findMineById(intruder.id, post.id)).toBeNull();
  });

  it("listMine 只返回自己的文章", async () => {
    const a = await createUser("USER", "a");
    const b = await createUser("USER", "b");
    await createPost(a.id, { slug: "a-post", title: "A 的文章" });
    await createPost(b.id, { slug: "b-post", title: "B 的文章" });

    const resA = await postRepo.listMine(a.id, { take: 20 });
    expect(resA.items).toHaveLength(1);
    expect(resA.items[0]?.slug).toBe("a-post");
  });

  it("软删除的文章不出现在 listMine", async () => {
    const user = await createUser();
    await createPost(user.id, { slug: "alive", title: "在的" });
    await createPost(user.id, { slug: "gone", title: "删的", deletedAt: new Date() });

    const res = await postRepo.listMine(user.id, { take: 20 });
    expect(res.items.map((i) => i.slug)).toEqual(["alive"]);
  });

  it("updateMine 对他人文章写入 0 行（归属校验下推到 SQL，无竞态窗口）", async () => {
    const owner = await createUser("USER", "owner");
    const intruder = await createUser("USER", "intruder");
    const post = await createPost(owner.id, { slug: "mine", title: "原标题" });

    const res = await postRepo.updateMine(intruder.id, post.id, { title: "被篡改" });
    expect(res.count).toBe(0);
    const after = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(after.title).toBe("原标题");
  });

  it("softDeleteMine 无法删除他人文章", async () => {
    const owner = await createUser("USER", "owner");
    const intruder = await createUser("USER", "intruder");
    const post = await createPost(owner.id, { slug: "mine", title: "原标题" });

    const res = await postRepo.softDeleteMine(intruder.id, post.id);
    expect(res.count).toBe(0);
    const after = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(after.deletedAt).toBeNull();
  });
});

describe("Gate 2.1 · 公开域强制四条件（status / auditStatus / visibility / deletedAt）", () => {
  it("八种状态组合的直达可见性逐格正确（PRD §3.2 矩阵）", async () => {
    const user = await createUser();
    await seedVisibilityMatrix(user.id);
    // 额外一条：已删除的公开文章
    await createPost(user.id, {
      slug: "p08-deleted",
      title: "已删除",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      auditStatus: "PASSED",
      deletedAt: new Date(),
    });

    // 直达域：PUBLISHED + PASSED + PUBLIC|UNLISTED + 未删除
    const reachable = ["p01-published-public", "p05-unlisted"];
    for (const slug of reachable) {
      expect(await postRepo.findPublicBySlug(slug), `直达应可见：${slug}`).not.toBeNull();
    }

    const blocked = [
      "p02-draft",
      "p03-review",
      "p04-rejected",
      "p06-private",
      "p07-archived",
      "p08-deleted",
    ];
    for (const slug of blocked) {
      expect(await postRepo.findPublicBySlug(slug), `直达应 404：${slug}`).toBeNull();
    }
  });

  it("列表域额外排除 UNLISTED（不推广就不进列表）", async () => {
    const user = await createUser();
    await seedVisibilityMatrix(user.id);

    const { items } = await postRepo.listPublic({ tab: "latest", take: 20 });
    const slugs = items.map((i) => i.slug);
    expect(slugs).toEqual(["p01-published-public"]);
  });

  it("搜索域不含 UNLISTED / PRIVATE / 草稿（PRD §5.7 过滤口径）", async () => {
    const user = await createUser();
    await createPost(user.id, { slug: "s-public", title: "公开打卡技巧", contentMd: "打卡" });
    await createPost(user.id, { slug: "s-unlisted", title: "不列出打卡", contentMd: "打卡", visibility: "UNLISTED" });
    await createPost(user.id, { slug: "s-private", title: "私密打卡", contentMd: "打卡", visibility: "PRIVATE" });
    await createPost(user.id, { slug: "s-draft", title: "草稿打卡", contentMd: "打卡", status: "DRAFT", auditStatus: "PENDING" });

    const { items } = await postRepo.searchPublic("打卡", { take: 20 });
    expect(items.map((i) => i.slug)).toEqual(["s-public"]);
  });

  it("公开四条件中的任一被破坏都会被拦截（防误删条件）", async () => {
    const user = await createUser();
    const base: PostSpec = { slug: "x", title: "标题", publishedAt: new Date() };

    const ok = await createPost(user.id, base);
    expect(await postRepo.findPublicBySlug(ok.slug)).not.toBeNull();

    // 只改 auditStatus → 应被拦
    await prisma.blogPost.update({ where: { id: ok.id }, data: { auditStatus: "PENDING" } });
    expect(await postRepo.findPublicBySlug(ok.slug)).toBeNull();

    await prisma.blogPost.update({ where: { id: ok.id }, data: { auditStatus: "PASSED", status: "DRAFT" } });
    expect(await postRepo.findPublicBySlug(ok.slug)).toBeNull();

    await prisma.blogPost.update({ where: { id: ok.id }, data: { status: "PUBLISHED", deletedAt: new Date() } });
    expect(await postRepo.findPublicBySlug(ok.slug)).toBeNull();

    await prisma.blogPost.update({ where: { id: ok.id }, data: { deletedAt: null, visibility: "PRIVATE" } });
    expect(await postRepo.findPublicBySlug(ok.slug)).toBeNull();
  });
});

describe("Gate 2.2 · 评论父级上提（深度恒 ≤2，B-06）", () => {
  it("对一条回复再回复，新评论的 parentId 指向顶层评论", async () => {
    const author = await createUser("USER", "author");
    const u1 = await createUser("USER", "c1");
    const u2 = await createUser("USER", "c2");
    const u3 = await createUser("USER", "c3");
    const post = await createPost(author.id, { slug: "post", title: "文章" });

    const top = await commentRepo.create(u1.id, {
      postId: post.id,
      parentId: null,
      content: "顶层评论",
      status: "APPROVED",
      auditStatus: "PASSED",
    });
    const reply = await commentRepo.create(u2.id, {
      postId: post.id,
      parentId: await commentRepo.resolveParent(post.id, top.id),
      content: "一级回复",
      status: "APPROVED",
      auditStatus: "PASSED",
    });
    // 对"回复"再回复 → 应被上提到顶层
    const deepened = await commentRepo.resolveParent(post.id, reply.id);
    const reply2 = await commentRepo.create(u3.id, {
      postId: post.id,
      parentId: deepened,
      content: "回复的回复",
      status: "APPROVED",
      auditStatus: "PASSED",
    });

    expect(reply2.parentId).toBe(top.id);
    expect(reply2.parentId).not.toBe(reply.id);

    // 结构性断言：不存在深度 ≥3 的评论
    const all = await prisma.comment.findMany({ where: { postId: post.id }, select: { id: true, parentId: true } });
    const roots = new Set(all.filter((c) => c.parentId === null).map((c) => c.id));
    for (const c of all) {
      if (c.parentId !== null) expect(roots.has(c.parentId), `评论 ${c.id} 的父级必须是顶层`).toBe(true);
    }
  });

  it("父评论不存在时抛 NotFoundError", async () => {
    const author = await createUser("USER", "author");
    const post = await createPost(author.id, { slug: "post", title: "文章" });
    await expect(commentRepo.resolveParent(post.id, "ckzzzzzzzzzzzzzzzzzzzzzzzz")).rejects.toThrow("父评论不存在");
  });

  it("父评论属于别的文章时同样抛 NotFoundError（不能跨文章挂载）", async () => {
    const author = await createUser("USER", "author");
    const postA = await createPost(author.id, { slug: "a", title: "A" });
    const postB = await createPost(author.id, { slug: "b", title: "B" });
    const c = await commentRepo.create(author.id, {
      postId: postA.id,
      parentId: null,
      content: "在 A 下的评论",
      status: "APPROVED",
      auditStatus: "PASSED",
    });
    await expect(commentRepo.resolveParent(postB.id, c.id)).rejects.toThrow("父评论不存在");
  });

  it("删除顶层评论会级联软删其回复，且保留占位（B-08）", async () => {
    const author = await createUser("USER", "author");
    const post = await createPost(author.id, { slug: "post", title: "文章" });
    const top = await commentRepo.create(author.id, {
      postId: post.id,
      parentId: null,
      content: "顶层",
      status: "APPROVED",
      auditStatus: "PASSED",
    });
    const reply = await commentRepo.create(author.id, {
      postId: post.id,
      parentId: top.id,
      content: "回复",
      status: "APPROVED",
      auditStatus: "PASSED",
    });

    const res = await commentRepo.softDelete(author.id, top.id, false);
    expect(res.count).toBe(1);
    expect(res.cascade).toBe(1);

    const after = await prisma.comment.findMany({ where: { postId: post.id }, orderBy: { createdAt: "asc" } });
    expect(after.every((c) => c.deletedAt !== null)).toBe(true);
    expect(after.find((c) => c.id === reply.id)?.deletedAt).not.toBeNull();
  });

  it("普通用户删不掉他人评论，管理员可以（C-03）", async () => {
    const author = await createUser("USER", "author");
    const other = await createUser("USER", "other");
    const admin = await createUser("ADMIN", "admin");
    const post = await createPost(author.id, { slug: "post", title: "文章" });
    const c = await commentRepo.create(author.id, {
      postId: post.id,
      parentId: null,
      content: "作者的评论",
      status: "APPROVED",
      auditStatus: "PASSED",
    });

    expect((await commentRepo.softDelete(other.id, c.id, false)).count).toBe(0);
    expect((await commentRepo.softDelete(admin.id, c.id, true)).count).toBe(1);
  });
});

describe("Gate 2.2 · 互动幂等（like 两次 → 明细与计数均为 1）", () => {
  it("like() 调用两次，PostLike 明细与 likeCount 均为 1", async () => {
    const user = await createUser();
    const liker = await createUser("USER", "liker");
    const post = await createPost(user.id, { slug: "post", title: "文章" });

    const first = await interactionRepo.like(post.id, liker.id);
    const second = await interactionRepo.like(post.id, liker.id);

    expect(first.added).toBe(true);
    expect(second.added).toBe(false);

    const detailCount = await prisma.postLike.count({ where: { postId: post.id } });
    const fresh = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(detailCount).toBe(1);
    expect(fresh.likeCount).toBe(1);
  });

  it("unlike() 幂等，重复调用不产生负计数", async () => {
    const user = await createUser();
    const liker = await createUser("USER", "liker");
    const post = await createPost(user.id, { slug: "post", title: "文章" });

    await interactionRepo.like(post.id, liker.id);
    await interactionRepo.unlike(post.id, liker.id);
    await interactionRepo.unlike(post.id, liker.id);

    const fresh = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(fresh.likeCount).toBe(0);
  });

  it("转发幂等：一人一帖一次，重复转发只更新转发语（A-11）", async () => {
    const user = await createUser();
    const reposter = await createUser("USER", "reposter");
    const post = await createPost(user.id, { slug: "post", title: "文章" });

    const first = await interactionRepo.repost(post.id, reposter.id, "第一次");
    const second = await interactionRepo.repost(post.id, reposter.id, "改过的转发语");

    expect(first.added).toBe(true);
    expect(second.added).toBe(false);
    expect(await prisma.postRepost.count({ where: { postId: post.id } })).toBe(1);
    const fresh = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(fresh.repostCount).toBe(1);
    const row = await prisma.postRepost.findFirstOrThrow({ where: { postId: post.id } });
    expect(row.comment).toBe("改过的转发语");
  });

  it("浏览去重：同 IP+UA+日期 只计一次（B-07）", async () => {
    const user = await createUser();
    const post = await createPost(user.id, { slug: "post", title: "文章" });
    const viewDate = new Date(Date.UTC(2026, 8, 30));

    const a = await interactionRepo.recordView(post.id, "hash-1", viewDate);
    const b = await interactionRepo.recordView(post.id, "hash-1", viewDate);
    const c = await interactionRepo.recordView(post.id, "hash-2", viewDate);

    expect(a.counted).toBe(true);
    expect(b.counted).toBe(false);
    expect(c.counted).toBe(true);
    const fresh = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(fresh.viewCount).toBe(2);
  });
});

describe("Gate 2.2 · 标签 scope 隔离（B-09 / A-07）", () => {
  it("博客标签仓储只能看到 POST 域，任务标签仓储只能看到 TASK 域", async () => {
    const user = await createUser();
    await prisma.tag.create({ data: { userId: user.id, scope: "TASK", name: "任务标签", color: "#6366F1" } });
    await prisma.tag.create({ data: { userId: user.id, scope: "POST", name: "博客标签", color: "#0EA5E9" } });

    const postTags = await blogTagRepo.listByScope(user.id, "POST");
    expect(postTags.map((t) => t.name)).toEqual(["博客标签"]);
    expect(postTags.some((t) => t.name === "任务标签")).toBe(false);

    const taskTags = await taskTagRepo.listByUser(user.id);
    expect(taskTags.map((t) => t.name)).toEqual(["任务标签"]);
    expect(taskTags.some((t) => t.name === "博客标签")).toBe(false);
  });

  it("同名标签可在两个域共存（唯一约束是 userId+scope+name）", async () => {
    const user = await createUser();
    const task = await prisma.tag.create({ data: { userId: user.id, scope: "TASK", name: "效率", color: "#6366F1" } });
    const post = await blogTagRepo.upsertForPost(user.id, "效率");

    expect(post.id).not.toBe(task.id);
    expect(await prisma.tag.count({ where: { userId: user.id, name: "效率" } })).toBe(2);
  });

  it("upsertForPost 复用同名 POST 标签，不重复建", async () => {
    const user = await createUser();
    const a = await blogTagRepo.upsertForPost(user.id, "效率");
    const b = await blogTagRepo.upsertForPost(user.id, "效率");
    expect(a.id).toBe(b.id);
    expect(await prisma.tag.count({ where: { userId: user.id, scope: "POST" } })).toBe(1);
  });

  it("countOwnedPostTags 不把 TASK 域标签算作可用", async () => {
    const user = await createUser();
    const taskTag = await prisma.tag.create({ data: { userId: user.id, scope: "TASK", name: "任务", color: "#6366F1" } });
    expect(await blogTagRepo.countOwnedPostTags(user.id, [taskTag.id])).toBe(0);
  });
});

describe("Gate 2.1 · 分页与游标", () => {
  it("listPublic 游标分页不重不漏", async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i++) {
      await createPost(user.id, {
        slug: `p-${i}`,
        title: `第 ${i} 篇`,
        publishedAt: new Date(Date.now() - i * 86_400_000),
      });
    }

    const page1 = await postRepo.listPublic({ tab: "latest", take: 2 });
    expect(page1.items.map((i) => i.slug)).toEqual(["p-0", "p-1"]);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await postRepo.listPublic({ tab: "latest", take: 2, cursor: page1.nextCursor! });
    expect(page2.items.map((i) => i.slug)).toEqual(["p-2", "p-3"]);

    const page3 = await postRepo.listPublic({ tab: "latest", take: 2, cursor: page2.nextCursor! });
    expect(page3.items.map((i) => i.slug)).toEqual(["p-4"]);
    expect(page3.nextCursor).toBeNull();
  });
});
