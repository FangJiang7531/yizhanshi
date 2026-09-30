import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCounterService } from "@/modules/blog/services/counter.service";
import { reconcileCounters } from "@/modules/blog/services/counter-reconcile";
import { prisma, resetDb, setupTestDb } from "./helpers/db";
import { createPost, createUser } from "./helpers/blog";

/**
 * 计数一致性集成测试（制作流程 Gate 2.3 / B-04 / B-05 / B-14）。
 *
 * 核心断言：**冗余计数与明细表在任何并发序列下都完全一致**。
 * 实现上的保障是"由明细重算 + 行锁串行化点 + 写冲突重试"三件套，
 * 对账脚本是第二道防线。
 */
const counter = createCounterService();

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("Gate 2.3 · 并发点赞", () => {
  it("同一用户并发 10 次 toggleLike，likeCount 与明细数完全一致（B-04）", async () => {
    const author = await createUser("USER", "author");
    const liker = await createUser("USER", "liker");
    const post = await createPost(author.id, { slug: "hot-post", title: "热帖" });

    await Promise.all(Array.from({ length: 10 }, () => counter.toggleLike(post.id, liker.id)));

    const detailCount = await prisma.postLike.count({ where: { postId: post.id } });
    const fresh = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });

    expect(fresh.likeCount).toBe(detailCount);
    // 10 次 toggle 是偶数次 → 净效果为未点赞；这里只强制"一致性"这条硬约束
    expect(detailCount).toBeLessThanOrEqual(10);
  });

  it("多个用户并发点赞同一文章，计数与明细始终一致", async () => {
    const author = await createUser("USER", "author");
    const post = await createPost(author.id, { slug: "hot-post", title: "热帖" });
    const users = await Promise.all(Array.from({ length: 8 }, (_, i) => createUser("USER", `u${i}`)));

    await Promise.all(users.map((u) => counter.toggleLike(post.id, u.id)));

    const detailCount = await prisma.postLike.count({ where: { postId: post.id } });
    const fresh = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(detailCount).toBe(8);
    expect(fresh.likeCount).toBe(8);
  });

  it("点赞 → 取消后计数回到原值，明细被删除（B-05）", async () => {
    const author = await createUser("USER", "author");
    const liker = await createUser("USER", "liker");
    const post = await createPost(author.id, { slug: "p", title: "文章" });

    const on = await counter.toggleLike(post.id, liker.id);
    expect(on).toEqual({ liked: true, likeCount: 1 });

    const off = await counter.toggleLike(post.id, liker.id);
    expect(off).toEqual({ liked: false, likeCount: 0 });
    expect(await prisma.postLike.count({ where: { postId: post.id } })).toBe(0);
  });

  it("并发转发切换后 repostCount 与明细一致", async () => {
    const author = await createUser("USER", "author");
    const post = await createPost(author.id, { slug: "p", title: "文章" });
    const reposter = await createUser("USER", "reposter");

    await Promise.all(Array.from({ length: 6 }, () => counter.toggleRepost(post.id, reposter.id, "转发语")));

    const detailCount = await prisma.postRepost.count({ where: { postId: post.id } });
    const fresh = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(fresh.repostCount).toBe(detailCount);
  });

  it("并发记录同一访客的浏览，viewCount 只 +1（B-07）", async () => {
    const author = await createUser("USER", "author");
    const post = await createPost(author.id, { slug: "p", title: "文章" });
    const viewDate = new Date(Date.UTC(2026, 8, 30));

    await Promise.all(
      Array.from({ length: 5 }, () => counter.recordView(post.id, "same-viewer", viewDate)),
    );

    const fresh = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(await prisma.postView.count({ where: { postId: post.id } })).toBe(1);
    expect(fresh.viewCount).toBe(1);
  });
});

describe("Gate 2.3 · 对账脚本（B-14）", () => {
  it("无漂移时报告为空", async () => {
    const author = await createUser("USER", "author");
    const liker = await createUser("USER", "liker");
    const post = await createPost(author.id, { slug: "p", title: "文章" });
    await counter.toggleLike(post.id, liker.id);

    const result = await reconcileCounters();
    expect(result.drifted).toEqual([]);
    expect(result.fixed).toBe(0);
  });

  it("检出人工制造的漂移并修正", async () => {
    const author = await createUser("USER", "author");
    const liker = await createUser("USER", "liker");
    const post = await createPost(author.id, { slug: "p", title: "文章" });
    await counter.toggleLike(post.id, liker.id); // 明细 1 条，likeCount = 1

    // 人为制造漂移：把 likeCount 改成 99，并伪造 repostCount / viewCount
    await prisma.blogPost.update({
      where: { id: post.id },
      data: { likeCount: 99, repostCount: 7, viewCount: 42 },
    });

    const dry = await reconcileCounters();
    const kinds = dry.drifted.map((d) => d.kind).sort();
    expect(kinds).toEqual(["post.likeCount", "post.repostCount", "post.viewCount"]);
    expect(dry.fixed).toBe(0); // dry-run 不修改

    const afterDry = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(afterDry.likeCount).toBe(99);

    const fixed = await reconcileCounters({ fix: true });
    expect(fixed.fixed).toBe(3);

    const after = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(after.likeCount).toBe(1);
    expect(after.repostCount).toBe(0);
    expect(after.viewCount).toBe(0);

    // 修正后再对账应干净
    const clean = await reconcileCounters();
    expect(clean.drifted).toEqual([]);
  });

  it("commentCount 口径与可见评论数一致（只算 APPROVED 且未软删）", async () => {
    const author = await createUser("USER", "author");
    const post = await createPost(author.id, { slug: "p", title: "文章" });

    await prisma.comment.createMany({
      data: [
        { postId: post.id, userId: author.id, content: "通过", status: "APPROVED", auditStatus: "PASSED" },
        { postId: post.id, userId: author.id, content: "待审", status: "PENDING", auditStatus: "PENDING" },
        { postId: post.id, userId: author.id, content: "驳回", status: "REJECTED", auditStatus: "REJECTED" },
        { postId: post.id, userId: author.id, content: "已删", status: "APPROVED", auditStatus: "PASSED", deletedAt: new Date() },
      ],
    });
    // 故意写错
    await prisma.blogPost.update({ where: { id: post.id }, data: { commentCount: 4 } });

    const result = await reconcileCounters({ fix: true });
    expect(result.drifted.map((d) => d.kind)).toContain("post.commentCount");
    expect(result.drifted.find((d) => d.kind === "post.commentCount")?.actual).toBe(1);

    const after = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(after.commentCount).toBe(1);
  });

  it("评论点赞漂移同样被检出与修正", async () => {
    const author = await createUser("USER", "author");
    const post = await createPost(author.id, { slug: "p", title: "文章" });
    const c = await prisma.comment.create({
      data: { postId: post.id, userId: author.id, content: "评论", status: "APPROVED", auditStatus: "PASSED" },
    });
    await counter.toggleCommentLike(c.id, author.id);
    await prisma.comment.update({ where: { id: c.id }, data: { likeCount: 5 } });

    const result = await reconcileCounters({ fix: true });
    expect(result.drifted.map((d) => d.kind)).toContain("comment.likeCount");
    const after = await prisma.comment.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.likeCount).toBe(1);
  });
});
