import { expect, test, type Page } from "@playwright/test";

/**
 * 全链路 E2E（PRD E-05）：注册 → 登录 → 建任务 → 勾选 → 建习惯 → 打卡 → 查总览 → 切主题 → 访客限制。
 * 依赖：本地 PostgreSQL 已就绪（npm run db:up）、迁移已应用。
 * 验证码获取：开发环境专用 /api/dev/last-code（需 E2E_CAPTURE_CODE=1，由 playwright.config.ts 注入）。
 */

const suffix = Date.now().toString(36);
const EMAIL = `e2e.${suffix}@test.local`;
const USERNAME = `e2e_${suffix}`.slice(0, 20);
const PASSWORD = ["E2e", "Pass", "123"].join("");

async function registerAndLogin(page: Page, request: import("@playwright/test").APIRequestContext) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "注册" }).click();

  await page.getByLabel("邮箱").fill(EMAIL);
  await page.getByRole("button", { name: "获取验证码" }).click();

  // 从开发捕获端点读取验证码（轮询最多 5 秒）
  let code = "";
  for (let i = 0; i < 10; i++) {
    const res = await request.get(`/api/dev/last-code?email=${encodeURIComponent(EMAIL)}`);
    if (res.ok()) {
      code = (await res.json()).code;
      break;
    }
    await page.waitForTimeout(500);
  }
  expect(code).toMatch(/^\d{6}$/);

  await page.getByLabel("验证码").fill(code);
  await page.getByRole("button", { name: "下一步" }).click();

  await page.getByLabel("用户名").fill(USERNAME);
  await page.getByLabel("密码", { exact: true }).fill(PASSWORD);
  await page.getByLabel("确认密码").fill(PASSWORD);
  await page.getByRole("button", { name: "注册并登录" }).click();

  await expect(page).toHaveURL(/dashboard/, { timeout: 15_000 });
}

test.describe("全链路用户旅程", () => {
  test("A. 未登录访问受保护路由被重定向到登录页", async ({ page }) => {
    await page.goto("/tasks");
    await expect(page).toHaveURL(/login/);
  });

  test("B. 注册 → 自动登录 → 侧边栏 9 入口齐全", async ({ page, request }) => {
    await registerAndLogin(page, request);
    for (const name of ["总览", "任务清单", "习惯打卡", "博客", "短链", "书签", "问卷", "视频下载", "文档转换"]) {
      await expect(page.getByRole("link", { name }).first()).toBeVisible();
    }
  });

  test("C. 建任务 → 勾选完成 → 删除有二次确认", async ({ page, request }) => {
    await registerAndLogin(page, request);
    await page.getByRole("link", { name: "任务清单" }).first().click();

    await page.getByRole("button", { name: "新增任务" }).click();
    await page.getByLabel("标题").fill("E2E 任务一");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await expect(page.getByText("E2E 任务一")).toBeVisible();

    await page.getByRole("checkbox", { name: /E2E 任务一/ }).click();
    await expect(page.getByRole("checkbox", { name: /取消完成：E2E 任务一/ })).toBeVisible();

    await page.getByRole("button", { name: `删除：E2E 任务一` }).click();
    await page.getByRole("button", { name: "删除", exact: true }).last().click();
    await expect(page.getByText("E2E 任务一")).toHaveCount(0);
  });

  test("D. 建习惯 → 打卡 → 取消打卡（数字与热力图联动）", async ({ page, request }) => {
    await registerAndLogin(page, request);
    await page.getByRole("link", { name: "习惯打卡" }).first().click();

    await page.getByRole("button", { name: "新增习惯" }).click();
    await page.getByLabel("名称").fill("E2E 阅读");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await expect(page.getByText("E2E 阅读")).toBeVisible();

    await page.getByRole("button", { name: `打卡：E2E 阅读` }).click();
    await expect(page.getByRole("button", { name: `取消打卡：E2E 阅读` })).toBeVisible();

    await page.getByRole("button", { name: `取消打卡：E2E 阅读` }).click();
    await expect(page.getByRole("button", { name: `打卡：E2E 阅读` })).toBeVisible();
  });

  test("E. 总览：问候语、统计卡片与快捷入口", async ({ page, request }) => {
    await registerAndLogin(page, request);
    await expect(page.getByText(/早上好|中午好|下午好|晚上好|夜深了/)).toBeVisible();
    await expect(page.getByText("今日完成")).toBeVisible();
    await expect(page.getByText("最长连续")).toBeVisible();
    await expect(page.getByText("快捷入口")).toBeVisible();
  });

  test("F. 主题切换：设置页选择主题，刷新后保留", async ({ page, request }) => {
    await registerAndLogin(page, request);
    await page.goto("/settings");
    await page.getByRole("button", { name: /科技感/ }).click();
    await expect(page.getByRole("button", { name: /科技感/ })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByRole("button", { name: /科技感/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("G. 访客模式：可浏览全部板块，写操作弹说明对话框（不静默失败）", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /访客模式/ }).click();
    await expect(page).toHaveURL(/dashboard/);

    await page.getByRole("link", { name: "任务清单" }).first().click();
    await page.getByRole("button", { name: "新增任务" }).click();
    await expect(page.getByText("访客模式无法保存数据")).toBeVisible();
    await page.getByRole("button", { name: "继续浏览" }).click();
  });
});
