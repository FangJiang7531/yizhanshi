/**
 * M8 验收辅助脚本：独立验证「建习惯 → 列表出现 → 打卡 → 取消打卡」核心行为。
 *
 * 动机：sandbox 环境下 Playwright Test Runner 长时会话会死锁，
 *       改用 Playwright Library API 在单进程内直连一个已就绪的 webServer 做定点验证。
 *
 * 用法：
 *   1) 先启动 webServer（E2E_CAPTURE_CODE=1，端口 3210）
 *   2) node scripts/verify-habit-flow.mjs
 */
import { chromium } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3210";
const PASSWORD = ["E2e", "Pass", "123"].join("");

function log(step, detail = "") {
  console.log(`[verify] ${step}${detail ? " :: " + detail : ""}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: BASE, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
const page = await context.newPage();

let failed = false;
async function check(name, fn) {
  try {
    await fn();
    log("PASS", name);
  } catch (err) {
    failed = true;
    log("FAIL", `${name} -> ${err.message.split("\n")[0]}`);
  }
}

try {
  const suffix = Date.now().toString(36);
  const EMAIL = `e2e.${suffix}@test.local`;
  const USERNAME = `e2e_${suffix}`.slice(0, 20);

  // ---- 注册并登录 ----
  await page.goto("/login");
  await page.getByRole("tab", { name: "注册" }).click();
  await page.getByLabel("邮箱").fill(EMAIL);
  await page.getByRole("button", { name: "获取验证码" }).click();

  let code = "";
  for (let i = 0; i < 12; i++) {
    const res = await context.request.get(`/api/dev/last-code?email=${encodeURIComponent(EMAIL)}`);
    if (res.ok()) {
      code = (await res.json()).code;
      break;
    }
    await page.waitForTimeout(400);
  }
  log("验证码", code || "(未取到)");

  await page.getByLabel("验证码").fill(code);
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByLabel("用户名").fill(USERNAME);
  await page.getByLabel("密码", { exact: true }).fill(PASSWORD);
  await page.getByLabel("确认密码").fill(PASSWORD);
  await page.getByRole("button", { name: "注册并登录" }).click();
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  log("PASS", "注册并登录 → /dashboard");

  // ---- 进入习惯页 ----
  await page.getByRole("link", { name: "习惯打卡" }).first().click();
  await page.waitForURL(/habits/, { timeout: 15000 });

  const HABIT = `E2E 阅读 ${suffix}`;

  // ---- 创建习惯（核心回归点）----
  await page.getByRole("button", { name: "新增习惯" }).first().click();
  await page.getByLabel("名称").fill(HABIT);
  await page.getByRole("button", { name: "创建", exact: true }).click();

  await check("创建习惯后列表立即出现", async () => {
    await page.getByText(HABIT).waitFor({ state: "visible", timeout: 10000 });
  });

  // ---- 打卡 ----
  await check("打卡按钮切换为「取消打卡」", async () => {
    await page.getByRole("button", { name: `打卡：${HABIT}` }).click();
    await page.getByRole("button", { name: `取消打卡：${HABIT}` }).waitFor({ state: "visible", timeout: 10000 });
  });

  // ---- 取消打卡 ----
  await check("取消打卡回退为「打卡」", async () => {
    await page.getByRole("button", { name: `取消打卡：${HABIT}` }).click();
    await page.getByRole("button", { name: `打卡：${HABIT}` }).waitFor({ state: "visible", timeout: 10000 });
  });

  // ---- 刷新后仍存在（服务端持久化）----
  await check("刷新后习惯仍在列表", async () => {
    await page.reload();
    await page.getByText(HABIT).waitFor({ state: "visible", timeout: 10000 });
  });
} catch (err) {
  failed = true;
  log("FATAL", err.message.split("\n")[0]);
} finally {
  await browser.close();
}

log(failed ? "结果：存在失败项" : "结果：全部通过");
process.exit(failed ? 1 : 0);
