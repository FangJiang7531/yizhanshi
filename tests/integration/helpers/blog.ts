import type { AuditStatus, PostStatus, PostVisibility, Role } from "@prisma/client";
import { loadSensitiveWords } from "@/modules/blog/lib/sensitive-filter";
import { renderMarkdown } from "@/modules/blog/lib/markdown";
import { calcStats } from "@/modules/blog/lib/stats";
import { prisma, uniqueUser } from "./db";

/**
 * 博客集成测试共用夹具。
 *
 * 两条纪律：
 * 1. 测试数据一律**直接落库**（绕开服务层），这样才能构造出"服务层本不该产生的非法态"
 *    来验证防线（例如 PENDING 审核但 PUBLISHED 状态的文章）；
 * 2. 敏感词库必须在每次清库后**重新从 DB 加载**，否则 `loadState.loaded` 为真而内存词库为空，
 *    审核会静默失效，测试会"假绿"。
 */

/** 与 prisma/seed/blog.seed.ts 保持一致的测试词库 */
export const TEST_SENSITIVE_WORDS = [
  { word: "测试违禁词", level: "BLOCK" as const, category: "test" },
  { word: "测试待审词", level: "REVIEW" as const, category: "test" },
  { word: "测试屏蔽词", level: "MASK" as const, category: "test" },
  { word: "加微信", level: "MASK" as const, category: "ad" },
];

/** 插入测试词库并加载进内存（必须在 resetDb 之后调用） */
export async function seedBlogSensitiveWords(): Promise<void> {
  await prisma.sensitiveWord.createMany({ data: TEST_SENSITIVE_WORDS.map((w) => ({ ...w })) });
  await loadSensitiveWords();
}

export async function createUser(role: Role = "USER", prefix = "blog") {
  const u = uniqueUser(prefix);
  return prisma.user.create({
    data: {
      username: u.username,
      email: u.email,
      displayName: u.username,
      role,
      timezone: "Asia/Shanghai",
    },
  });
}

export type PostSpec = {
  slug: string;
  title: string;
  contentMd?: string;
  status?: PostStatus;
  visibility?: PostVisibility;
  auditStatus?: AuditStatus;
  auditNote?: string | null;
  publishedAt?: Date | null;
  deletedAt?: Date | null;
  allowComment?: boolean;
  allowRepost?: boolean;
  tags?: string[];
};

/** 直接落库构造文章（含 contentHtml 与派生字段，模拟"已发布"的完整形态） */
export async function createPost(userId: string, spec: PostSpec) {
  const contentMd = spec.contentMd ?? `这是 ${spec.title} 的正文。`;
  const { html } = await renderMarkdown(contentMd);
  const stats = calcStats(contentMd);

  const tagIds: string[] = [];
  for (const name of spec.tags ?? []) {
    const tag = await prisma.tag.upsert({
      where: { userId_scope_name: { userId, scope: "POST", name } },
      create: { userId, scope: "POST", name, color: "#0EA5E9" },
      update: {},
      select: { id: true },
    });
    tagIds.push(tag.id);
  }

  return prisma.blogPost.create({
    data: {
      userId,
      slug: spec.slug,
      title: spec.title,
      contentMd,
      contentHtml: html,
      status: spec.status ?? "PUBLISHED",
      visibility: spec.visibility ?? "PUBLIC",
      auditStatus: spec.auditStatus ?? "PASSED",
      auditNote: spec.auditNote ?? null,
      publishedAt: spec.publishedAt === undefined ? new Date() : spec.publishedAt,
      deletedAt: spec.deletedAt ?? null,
      allowComment: spec.allowComment ?? true,
      allowRepost: spec.allowRepost ?? true,
      wordCount: stats.wordCount,
      readingMinutes: stats.readingMinutes,
      tags: tagIds.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
    },
  });
}

/**
 * P-01 ~ P-07 七种可见性状态组合（PRD §3.2 矩阵的固定数据集）。
 * 返回 slug → id 映射，便于断言。
 */
export async function seedVisibilityMatrix(userId: string): Promise<Record<string, string>> {
  const prev = new Date(Date.now() - 3 * 86_400_000);
  const specs: PostSpec[] = [
    { slug: "p01-published-public", title: "P-01 已发布+公开", status: "PUBLISHED", visibility: "PUBLIC", auditStatus: "PASSED", publishedAt: prev },
    { slug: "p02-draft", title: "P-02 草稿", status: "DRAFT", visibility: "PUBLIC", auditStatus: "PENDING", publishedAt: null },
    { slug: "p03-review", title: "P-03 待审", status: "REVIEW", visibility: "PUBLIC", auditStatus: "PENDING", publishedAt: null },
    { slug: "p04-rejected", title: "P-04 已驳回", status: "REVIEW", visibility: "PUBLIC", auditStatus: "REJECTED", publishedAt: null },
    { slug: "p05-unlisted", title: "P-05 不列出", status: "PUBLISHED", visibility: "UNLISTED", auditStatus: "PASSED", publishedAt: prev },
    { slug: "p06-private", title: "P-06 私密", status: "PUBLISHED", visibility: "PRIVATE", auditStatus: "PASSED", publishedAt: prev },
    { slug: "p07-archived", title: "P-07 已归档", status: "ARCHIVED", visibility: "PUBLIC", auditStatus: "PASSED", publishedAt: null },
  ];
  const out: Record<string, string> = {};
  for (const spec of specs) {
    const post = await createPost(userId, spec);
    out[spec.slug] = post.id;
  }
  return out;
}

export { prisma };
