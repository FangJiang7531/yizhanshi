import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 配置。
 * 需要本地 PostgreSQL（npm run db:up）与迁移就绪；webServer 自动启动 next dev。
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npx next dev -p 3100",
        url: "http://127.0.0.1:3100/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          E2E_CAPTURE_CODE: "1",
          DATABASE_URL:
            process.env.E2E_DATABASE_URL ??
            "postgresql://pwb:pwb_dev_password@localhost:5433/personal_workbench_dev",
          AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret-0123456789abcdef0123456789abcdef",
        },
      },
});
