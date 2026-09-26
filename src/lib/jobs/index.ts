import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * 后台任务抽象（JobRunner）—— 本期实现“数据库任务表”适配器：
 * 任务写入 Job 表，由 /api/cron 端点（带 CRON_SECRET）驱动执行；
 * 本期不接 Cron 触发，接口先行。阶段二可替换为 BullMQ + Redis。
 */
export interface JobRunner {
  enqueue(type: string, payload: Record<string, unknown>, runAt?: Date): Promise<string>;
}

class DbJobRunner implements JobRunner {
  async enqueue(type: string, payload: Record<string, unknown>, runAt = new Date()): Promise<string> {
    const job = await prisma.job.create({
      data: { type, payloadJson: JSON.stringify(payload), runAt },
    });
    logger.info({ module: "jobs", jobId: job.id, jobType: type }, "job enqueued");
    return job.id;
  }
}

export const jobRunner: JobRunner = new DbJobRunner();
