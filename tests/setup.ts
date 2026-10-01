import "@testing-library/jest-dom/vitest";
import { afterAll, beforeAll, vi } from "vitest";

/**
 * 全局测试准备。
 * - 注入测试环境默认环境变量（避免 env.ts 在测试期快速失败）
 * - 集成测试自行管理数据库连接与事务回滚
 */
const envDefaults: Record<string, string> = {
  // 显式 127.0.0.1：本机 localhost（IPv6 ::1 优先解析）路径曾被安全软件拦截导致 P1001
  DATABASE_URL:
    "postgresql://pwb:pwb_dev_password@127.0.0.1:5433/personal_workbench_test",
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

// 测试期强制禁用真实 SMTP：空串经 emptyToUndefined 归一化为未配置 → 控制台适配器。
// 即使 CI 环境意外携带 SMTP_* 变量，也不会在测试中发出真实邮件。
for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]) {
  process.env[key] = "";
}

// 静默测试期的 logger 噪声，仅在断言 logger 行为时用 vi.spyOn 恢复
beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});
