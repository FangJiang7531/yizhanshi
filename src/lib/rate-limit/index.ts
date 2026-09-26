import { prisma } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";

/**
 * 基于数据库计数的限流（阶段三迁 Redis）。
 * 固定窗口：同一 key 在 window 内最多 limit 次，超限抛 RateLimitError。
 * 测试钩子：RATE_LIMIT_DISABLED=1 时完全关闭（仅 E2E webServer / 测试环境注入）。
 */
export async function enforceRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  if (process.env.RATE_LIMIT_DISABLED === "1") return;

  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);

  const bucket = await prisma.rateLimitBucket.upsert({
    where: { key },
    create: { key, count: 0, windowStart },
    update: {},
  });

  // 窗口已翻新：重置计数并消耗本次
  if (bucket.windowStart.getTime() !== windowStart.getTime()) {
    await prisma.rateLimitBucket.update({ where: { key }, data: { count: 1, windowStart } });
    return;
  }

  if (bucket.count >= limit) throw new RateLimitError();

  await prisma.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
}
