import "@testing-library/jest-dom/vitest";
import { afterAll, beforeAll, vi } from "vitest";

/**
 * 全局测试准备。
 * - 注入测试环境默认环境变量（避免 env.ts 在测试期快速失败）
 * - 集成测试自行管理数据库连接与事务回滚
 */
const envDefaults: Record<string, string> = {
  DATABASE_URL:
    "postgresql://pwb:pwb_dev_password@localhost:5433/personal_workbench_test",
  AUTH_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
  APP_URL: "http://localhost:3000",
  LOG_LEVEL: "error",
  MAIL_FROM: "no-reply@workbench.local",
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_DIR: "./.storage-test",
};

for (const [key, value] of Object.entries(envDefaults)) {
  if (!process.env[key]) process.env[key] = value;
}

// 静默测试期的 logger 噪声，仅在断言 logger 行为时用 vi.spyOn 恢复
beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});
