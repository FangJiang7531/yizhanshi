/**
 * 博客板块种子数据（制作流程 Step 0.5）
 * - 敏感词库（合成测试词，真实词库由管理员维护）
 * - P-01 ~ P-15 固定测试数据集：覆盖全部可见性状态与边界（供单测/集成/E2E 使用）
 * - 互动数据（点赞/评论/浏览）：保证冗余计数与明细一致（对账脚本基准）
 *
 * 注意：本文件由 prisma/seed.ts 调用，运行环境是 tsx（非 Next）。
 * 这里统一使用相对路径导入，使种子逻辑与 tsx CLI 的执行上下文解耦
 * （实测 tsx 能解析 tsconfig 的 `@/` 别名，但种子脚本保持零别名更稳）。
 */
import type { PrismaClient } from "@prisma/client";
import { renderMarkdown } from "../../src/modules/blog/lib/markdown";
import { calcStats } from "../../src/modules/blog/lib/stats";
import { buildHabitCardMarker, buildTaskCardMarker } from "../../src/modules/blog/lib/data-cards";

type SeedPost = {
  slug: string;
  title: string;
  excerpt?: string;
  contentMd: string;
  status: "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";
  visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
  auditStatus: "PENDING" | "PASSED" | "REJECTED";
  auditNote?: string;
  publishedAtDaysAgo?: number;
  tags?: string[];
  allowComment?: boolean;
  deletedDaysAgo?: number;
};

/** P-01 ~ P-15 固定测试数据集 */
function buildPostSpecs(): SeedPost[] {
  const specs: SeedPost[] = [
    {
      // P-01：已发布、公开、有标签 → 正常渲染 + 搜索命中基准
      slug: "task-weekly-workflow",
      title: "用任务清单管理一周：我的最小工作流",
      excerpt: "把任务拆小、给优先级、每天回顾——坚持三周后，我丢事的次数明显少了。",
      tags: ["效率", "方法论"],
      status: "PUBLISHED",
      visibility: "PUBLIC",
      auditStatus: "PASSED",
      publishedAtDaysAgo: 6,
      contentMd: [
        "## 为什么是任务清单",
        "",
        "我以前靠脑子记事，结果总是**想起来才做**。改成任务清单之后，每天早上花两分钟过一遍，心里就有底了。",
        "",
        "## 我的三步法",
        "",
        "1. 收集：所有待办先记下来，不做取舍",
        "2. 排序：用优先级标记，只保留今天真的要做的",
        "3. 回顾：晚上勾掉完成的，顺手给习惯打个卡",
        "",
        "> 工具不重要，重要的是每天真的看一眼。",
        "",
        "| 时段 | 动作 | 耗时 |",
        "| --- | --- | --- |",
        "| 早上 | 过清单、定优先级 | 2 分钟 |",
        "| 中午 | 补充新任务 | 1 分钟 |",
        "| 晚上 | 回顾 + 打卡 | 2 分钟 |",
        "",
        "- [x] 坚持记录",
        "- [ ] 每周复盘一次",
      ].join("\n"),
    },
    {
      // P-02：草稿（含搜索关键词，用于断言搜索不返回草稿）
      slug: "draft-unfinished",
      title: "（草稿）还没写完的文章",
      status: "DRAFT",
      visibility: "PUBLIC",
      auditStatus: "PENDING",
      contentMd: "这篇文章里也出现了打卡两个字，但它还是草稿，搜索不应该把它翻出来。",
    },
    {
      // P-03：待审（正文含 REVIEW 级词）
      slug: "review-post-body",
      title: "一篇等待审核的文章",
      status: "REVIEW",
      visibility: "PUBLIC",
      auditStatus: "PENDING",
      contentMd: "正文里包含测试待审词，发布后被转入了人工审核队列，公众暂时看不到。",
    },
    {
      // P-04：已驳回（作者可见、公众不可见，带驳回原因）
      slug: "rejected-post",
      title: "一篇被驳回的文章",
      status: "REVIEW",
      visibility: "PUBLIC",
      auditStatus: "REJECTED",
      auditNote: "内容需要补充来源说明，修改后可重新提交审核。",
      contentMd: "这篇文章因为缺少来源说明被驳回了，作者可以在『我的文章』里看到原因。",
    },
    {
      // P-05：UNLISTED（列表不出现、直达可访问、sitemap 不含、不加 noindex）
      slug: "unlisted-post",
      title: "不列出但可通过链接访问的文章",
      status: "PUBLISHED",
      visibility: "UNLISTED",
      auditStatus: "PASSED",
      publishedAtDaysAgo: 4,
      contentMd: "这是一篇 UNLISTED 文章：不会出现在列表、RSS 与站点地图里，但通过直达链接可以正常访问，也不加 noindex。",
    },
    {
      // P-06：PRIVATE（全站不可见、加 noindex）
      slug: "private-post",
      title: "仅自己可见的私密文章",
      status: "PUBLISHED",
      visibility: "PRIVATE",
      auditStatus: "PASSED",
      publishedAtDaysAgo: 3,
      contentMd: "这是一篇 PRIVATE 文章：只有作者本人能看，其余人直达链接也是 404，页面带 noindex, nofollow。",
    },
    {
      // P-07：已软删除（全站不可见）
      slug: "deleted-post",
      title: "已经被删除的文章",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      auditStatus: "PASSED",
      publishedAtDaysAgo: 10,
      deletedDaysAgo: 2,
      contentMd: "这篇文章已经进入回收站，任何入口都不应该能看到它。",
    },
    {
      // P-08：标题含 REVIEW 级词 → 审核拦截（转待审）
      slug: "review-post-title",
      title: "测试待审词：标题层面的审核示例",
      status: "REVIEW",
      visibility: "PUBLIC",
      auditStatus: "PENDING",
      contentMd: "敏感词校验覆盖标题、摘要、正文、标签名六个入口，这是标题命中的示例。",
    },
    {
      // P-09：XSS 载荷（script）——渲染后必须被转义为纯文本
      slug: "xss-script-post",
      title: "安全测试：脚本注入载荷",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      auditStatus: "PASSED",
      publishedAtDaysAgo: 5,
      contentMd: "下面这行在渲染后应该显示为纯文本，不会执行：\n\n<script>alert(1)</script>\n\n以上。",
    },
    {
      // P-10：XSS 载荷（img onerror）
      slug: "xss-img-post",
      title: "安全测试：图片事件载荷",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      auditStatus: "PASSED",
      publishedAtDaysAgo: 5,
      contentMd: "下面这行同样只应显示为纯文本：\n\n<img src=x onerror=alert(1)>\n\n结束。",
    },
    {
      // P-11：5000 字无标点中文（search / pagination / readingMinutes=13）
      slug: "long-chinese-post",
      title: "长文测试：五千字连续中文",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      auditStatus: "PASSED",
      publishedAtDaysAgo: 8,
      contentMd: "打卡".repeat(2500),
    },
    {
      // P-13：emoji 与中英混排标题 → slug 生成
      slug: "release-flow",
      title: "🚀 Release Flow 发布流程体验",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      auditStatus: "PASSED",
      publishedAtDaysAgo: 2,
      tags: ["效率"],
      contentMd: "标题带了 emoji 与中英混排，slug 生成应该保留可用的英文部分：release-flow。",
    },
    {
      // P-15：数据卡片（习惯打卡快照 + 任务进度快照）
      slug: "data-card-post",
      title: "本周复盘：数据卡片示例",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      auditStatus: "PASSED",
      publishedAtDaysAgo: 1,
      tags: ["效率"],
      contentMd: [
        "## 本周打卡",
        "",
        "把习惯数据贴进文章，数字会在发布时被快照固定下来：",
        "",
        buildHabitCardMarker("demo-habit-reading", {
          name: "阅读 30 分钟",
          range: "week",
          done: 5,
          target: 7,
          days: [true, true, true, false, true, true, false],
        }),
        "",
        "## 任务进度",
        "",
        buildTaskCardMarker("demo-task-batch", {
          title: "本周待办",
          total: 10,
          completed: 6,
        }),
        "",
        "以上数据均为发布时快照，不会随下周数据变化。",
      ].join("\n"),
    },
  ];

  // P-14：30 篇同标签文章（标签归档分页，每页 20 条）
  for (let i = 1; i <= 30; i++) {
    specs.push({
      slug: `serial-${String(i).padStart(2, "0")}`,
      title: `连载计划第 ${i} 篇：持续写作练习`,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      auditStatus: "PASSED",
      publishedAtDaysAgo: 20 - Math.min(i, 19),
      tags: ["连载"],
      contentMd: `这是连载计划的第 ${i} 篇。持续写作的关键不是灵感，而是把发布时间固定下来。`,
    });
  }

  return specs;
}

/** 创建一篇文章（含渲染 HTML 与派生字段） */
async function createPost(
  prisma: PrismaClient,
  userId: string,
  spec: SeedPost,
  tagIds: Map<string, string>,
) {
  const { html } = await renderMarkdown(spec.contentMd);
  const { wordCount, readingMinutes } = calcStats(spec.contentMd);
  const now = Date.now();
  const publishedAt =
    spec.publishedAtDaysAgo !== undefined ? new Date(now - spec.publishedAtDaysAgo * 86_400_000) : null;

  return prisma.blogPost.create({
    data: {
      userId,
      slug: spec.slug,
      title: spec.title,
      excerpt: spec.excerpt ?? (spec.contentMd.slice(0, 100) || null),
      contentMd: spec.contentMd,
      contentHtml: html,
      status: spec.status,
      visibility: spec.visibility,
      auditStatus: spec.auditStatus,
      auditNote: spec.auditNote ?? null,
      publishedAt,
      wordCount,
      readingMinutes,
      allowComment: spec.allowComment ?? true,
      allowRepost: true,
      deletedAt: spec.deletedDaysAgo !== undefined ? new Date(now - spec.deletedDaysAgo * 86_400_000) : null,
      tags: spec.tags
        ? {
            create: spec.tags
              .map((name) => tagIds.get(name))
              .filter((id): id is string => Boolean(id))
              .map((tagId) => ({ tagId })),
          }
        : undefined,
    },
  });
}

export async function seedSensitiveWords(prisma: PrismaClient): Promise<void> {
  const words = [
    { word: "测试违禁词", level: "BLOCK" as const, category: "test" },
    { word: "测试待审词", level: "REVIEW" as const, category: "test" },
    { word: "测试屏蔽词", level: "MASK" as const, category: "test" },
    { word: "加微信", level: "MASK" as const, category: "ad" },
  ];
  for (const w of words) {
    await prisma.sensitiveWord.upsert({
      where: { word: w.word },
      create: w,
      update: { level: w.level, category: w.category, enabled: true },
    });
  }
  console.log(`🌱 敏感词库：${words.length} 条已就绪`);
}

/** 返回第二个用户（他人文章所有者）用于越权测试 */
export async function seedBlogData(
  prisma: PrismaClient,
  demoUserId: string,
  passwordHash: string,
): Promise<{ otherUserId: string }> {
  // 第二个用户：P-12 他人文章 / 互动数据来源
  const other = await prisma.user.create({
    data: {
      username: "zhang_san",
      email: "zhang_san@example.com",
      displayName: "张三",
      passwordHash,
      timezone: "Asia/Shanghai",
      setting: { create: { themeName: "classic-paper", colorMode: "SYSTEM" } },
    },
  });

  // 博客标签（scope=POST，与任务标签隔离）
  const tagDefs = [
    { name: "效率", color: "#0EA5E9" },
    { name: "方法论", color: "#8B5CF6" },
    { name: "连载", color: "#F97316" },
  ];
  const tagIds = new Map<string, string>();
  for (const def of tagDefs) {
    const tag = await prisma.tag.create({
      data: { userId: demoUserId, scope: "POST", name: def.name, color: def.color },
    });
    tagIds.set(def.name, tag.id);
  }

  console.log("🌱 灌入博客测试文章（P-01 ~ P-15）…");
  const specs = buildPostSpecs();
  const created = new Map<string, string>(); // slug → id
  for (const spec of specs) {
    const post = await createPost(prisma, demoUserId, spec, tagIds);
    created.set(spec.slug, post.id);
  }

  // P-12：他人文章（zhang_san 所有，用于越权读/改/删测试）
  await createPost(
    prisma,
    other.id,
    {
      slug: "others-post",
      title: "他人的文章（越权测试基线）",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      auditStatus: "PASSED",
      publishedAtDaysAgo: 7,
      contentMd: "这篇文章属于 zhang_san。demo 用户对它的编辑/删除操作必须全部失败。",
    },
    new Map(),
  );

  // 互动数据：点赞 / 评论（保证冗余计数与明细一致，作为对账脚本基准）
  const p01 = created.get("task-weekly-workflow")!;
  await prisma.postLike.create({ data: { postId: p01, userId: other.id } });
  await prisma.blogPost.update({ where: { id: p01 }, data: { likeCount: 1 } });

  const topComment = await prisma.comment.create({
    data: {
      postId: p01,
      userId: other.id,
      content: "写得很实用，我也在用类似的方法，坚持下来确实有效果。",
      status: "APPROVED",
      auditStatus: "PASSED",
    },
  });
  await prisma.comment.create({
    data: {
      postId: p01,
      userId: demoUserId,
      parentId: topComment.id,
      content: "谢谢！可以试试早上过一遍清单，效果更明显。",
      status: "APPROVED",
      auditStatus: "PASSED",
    },
  });
  await prisma.blogPost.update({ where: { id: p01 }, data: { commentCount: 2 } });

  // 浏览去重记录（同 IP+UA+日期一条）
  const today = new Date();
  const viewDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  await prisma.postView.createMany({
    data: [
      { postId: p01, viewerHash: "seed-viewer-hash-1", viewDate },
      { postId: p01, viewerHash: "seed-viewer-hash-2", viewDate },
    ],
  });
  await prisma.blogPost.update({ where: { id: p01 }, data: { viewCount: 2 } });

  console.log(`🌱 博客文章：${specs.length + 1} 篇已就绪（含 P-14 连载 30 篇）`);
  return { otherUserId: other.id };
}
