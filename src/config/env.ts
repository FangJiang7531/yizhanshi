import { z } from "zod";

/**
 * 环境变量集中校验（快速失败：配置不合法时立即终止启动，而非带病运行）。
 * 构建阶段（next build）与 CI 的纯打包步骤可通过 NEXT_PHASE / SKIP_ENV_VALIDATION 跳过。
 */
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "缺少数据库连接串")
    .refine((v) => v.startsWith("postgresql://") || v.startsWith("postgres://"), {
      message: "DATABASE_URL 必须是 PostgreSQL 连接串",
    }),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET 至少 32 字符"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  MAIL_FROM: z.string().email().default("no-reply@workbench.local"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./.storage"),
  TOOL_SERVICE_DOWNLOADER_URL: z.string().url().optional(),
  TOOL_SERVICE_DOCCONVERT_URL: z.string().url().optional(),
  TOOL_SERVICE_TOKEN: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.SKIP_ENV_VALIDATION) {
    // 构建期不连库、不强校验，仅给出类型安全的占位
    return envSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://build:build@localhost:5432/build",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "build-phase-placeholder-secret-000000000000",
      APP_URL: process.env.APP_URL ?? "http://localhost:3000",
      NODE_ENV: process.env.NODE_ENV,
    });
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("环境变量校验失败，应用无法启动：");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1); // 快速失败
  }
  return parsed.data;
}

export const env = loadEnv();
