import { prisma } from "@/lib/db";

/**
 * 集成测试基建：真实 PostgreSQL（tests/setup.ts 注入的 DATABASE_URL）。
 *
 * 测试库（personal_workbench_test）与其 schema 由以下途径预先就绪：
 * - 本地：npm run db:up（scripts/dev-db.mjs 创建 dev/test 两个库并同步 schema）
 * - CI：postgres service + prisma migrate deploy
 *
 * 本文件不做任何 DDL；每个套件开始前用 Prisma 级联删除清库，保证用例互不污染。
 */

let ready: Promise<void> | null = null;

/** 套件级初始化（幂等，多文件共享同一 Promise） */
export function setupTestDb(): Promise<void> {
  ready ??= (async () => {
    await prisma.$connect();
    try {
      await prisma.user.count();
    } catch {
      throw new Error("测试库不可用：请先运行 npm run db:up（本地）或确认 CI 已执行 prisma migrate deploy");
    }
  })();
  return ready;
}

/** 清空全部业务数据（级联删除），让每个套件从干净状态开始 */
export async function resetDb(): Promise<void> {
  await prisma.user.deleteMany();
  await prisma.verificationCode.deleteMany();
  await prisma.rateLimitBucket.deleteMany();
  await prisma.job.deleteMany();
}

let counter = 0;

/** 生成唯一的用户名/邮箱，避免用例间冲突 */
export function uniqueUser(prefix: string): { username: string; email: string } {
  counter += 1;
  const suffix = `${Date.now().toString(36)}${counter}`;
  return {
    username: `${prefix}_${suffix}`.toLowerCase(),
    email: `${prefix}.${suffix}@test.local`.toLowerCase(),
  };
}

export { prisma };
