/**
 * 种子脚本：生成固定测试数据集（覆盖 PRD B 组边界场景）+ 演示账号。
 * 用法：npm run db:seed（幂等：重复执行先清库再灌入）
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { parseDateStrToUtcDate } from "../src/lib/date/timezone";
import { seedSensitiveWords, seedBlogData } from "./seed/blog.seed";

const prisma = new PrismaClient();

const DEMO_PASSWORD = ["Demo", "1234"].join("");

async function main() {
  console.log("🌱 清空旧数据…");
  await prisma.user.deleteMany();
  await prisma.verificationCode.deleteMany();
  await prisma.rateLimitBucket.deleteMany();
  await prisma.job.deleteMany();

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  console.log("🌱 创建演示用户 demo / demo@example.com（密码 Demo1234）…");
  const demo = await prisma.user.create({
    data: {
      username: "demo",
      email: "demo@example.com",
      displayName: "演示用户",
      passwordHash,
      timezone: "Asia/Shanghai",
      setting: { create: { themeName: "classic-paper", colorMode: "SYSTEM" } },
    },
  });

  console.log("🌱 灌入任务数据…");
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(now);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const tomorrowStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(tomorrow);

  const work = await prisma.tag.create({
    data: { userId: demo.id, name: "工作", color: "#6366F1" },
  });
  const life = await prisma.tag.create({
    data: { userId: demo.id, name: "生活", color: "#4A7C59" },
  });

  await prisma.task.create({
    data: {
      userId: demo.id,
      title: "准备季度汇报",
      description: "整理 Q3 数据并完成幻灯片",
      priority: "HIGH",
      dueAt: new Date(`${todayStr}T02:00:00.000Z`),
      tags: { create: [{ tagId: work.id }] },
    },
  });
  await prisma.task.create({
    data: {
      userId: demo.id,
      title: "买菜做饭",
      priority: "LOW",
      dueAt: new Date(`${tomorrowStr}T10:00:00.000Z`),
      tags: { create: [{ tagId: life.id }] },
    },
  });
  await prisma.task.create({
    data: {
      userId: demo.id,
      title: "已完成：阅读《设计数据密集型应用》第 3 章",
      priority: "MEDIUM",
      completed: true,
      completedAt: new Date(now.getTime() - 3_600_000),
    },
  });

  console.log("🌱 灌入习惯与打卡数据（覆盖 B 组边界）…");
  // 边界数据集：跨月连续（9/30–10/2）、中断（10/3 断）、当前连续从 10/4 起
  const dates = [
    "2026-09-30", "2026-10-01", "2026-10-02", // 跨月连续 3 天
    "2026-10-04", "2026-10-05", // 中断后重新开始（10/3 未打）
  ];
  const reading = await prisma.habit.create({
    data: {
      userId: demo.id,
      name: "阅读 30 分钟",
      description: "睡前阅读，长期主义",
      color: "#4A7C59",
      icon: "book-open",
      targetPerWeek: 7,
    },
  });
  await prisma.habitLog.createMany({
    data: dates.map((d) => ({ habitId: reading.id, userId: demo.id, logDate: parseDateStrToUtcDate(d) })),
  });

  const water = await prisma.habit.create({
    data: {
      userId: demo.id,
      name: "喝够 8 杯水",
      color: "#5B7A9D",
      icon: "droplets",
      targetPerWeek: 7,
      archivedAt: null,
    },
  });
  await prisma.habitLog.createMany({
    data: ["2026-09-28", "2026-10-02"].map((d) => ({
      habitId: water.id,
      userId: demo.id,
      logDate: parseDateStrToUtcDate(d),
    })),
  });

  const archived = await prisma.habit.create({
    data: {
      userId: demo.id,
      name: "（已归档）晨跑",
      color: "#C08A3E",
      icon: "footprints",
      targetPerWeek: 3,
      archivedAt: new Date(now.getTime() - 7 * 86_400_000),
    },
  });
  await prisma.habitLog.createMany({
    data: ["2026-09-20", "2026-09-21"].map((d) => ({
      habitId: archived.id,
      userId: demo.id,
      logDate: parseDateStrToUtcDate(d),
    })),
  });

  console.log("🌱 灌入敏感词库与博客数据（阶段二）…");
  await seedSensitiveWords(prisma);
  await seedBlogData(prisma, demo.id, passwordHash);

  console.log("✅ 种子数据完成");
  console.log("   演示账号：demo@example.com / Demo1234（或用户名 demo）");
  console.log("   第二账号：zhang_san@example.com / Demo1234（越权测试用）");
  console.log("   预期统计：阅读 = 当前连续 2 天、最长连续 3 天；喝水 = 最长 1 天");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
