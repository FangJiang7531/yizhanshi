/**
 * 移动端导航一次性验证脚本（非留存测试）：
 * 验证手机视口下侧边栏不再遮挡内容、抽屉可正常开合。
 * 前提：dev server 已启动（默认 http://localhost:3000），访客 cookie 访问（不依赖数据库）。
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
function report(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch();
// iPhone 12/13 尺寸（375×812），DPR 3
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
await ctx.addCookies([{ name: "pwb_guest", value: "1", url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));

try {
  await page.goto(`${BASE}/tasks`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("aside[aria-label='主导航']", { timeout: 30000 });
  await page.waitForTimeout(800);

  const vw = 375;
  const asideBox = await page.locator("aside[aria-label='主导航']").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width };
  });
  report(
    "侧边栏关闭态完全移出屏幕（不遮挡内容）",
    asideBox.right <= 0.5,
    `aside left=${asideBox.left.toFixed(1)} right=${asideBox.right.toFixed(1)} width=${asideBox.width.toFixed(1)}`,
  );

  // 内容区主元素不被侧边栏盖住：取顶栏下的内容标题
  const contentLeft = await page
    .locator("main")
    .evaluate((el) => el.getBoundingClientRect().left);
  report("内容区从视口左缘开始（flex-1 不被挤占）", Math.abs(contentLeft) < 1, `main.left=${contentLeft.toFixed(1)}`);

  // 视口左缘中点命中的元素不是 aside（否则即遮挡）
  const hitTag = await page.evaluate(() => {
    const el = document.elementFromPoint(8, 200);
    return el ? el.closest("aside") ? "ASIDE" : el.tagName : "none";
  });
  report("视口左缘可见内容不是侧边栏", hitTag !== "ASIDE", `elementFromPoint(8,200)=${hitTag}`);

  // 打开抽屉：点顶栏汉堡按钮
  await page.locator("button[aria-label='打开导航菜单'], topbar button.md\\:hidden").first().click().catch(async () => {
    // 兜底：按 aria/类名找不到时，用 topbar 内第一个 md:hidden 按钮
    await page.locator("header button").first().click();
  });
  await page.waitForTimeout(450);
  const openBox = await page.locator("aside[aria-label='主导航']").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right };
  });
  report(
    "点汉堡后抽屉滑入（左缘贴近视口左侧）",
    Math.abs(openBox.left) < 2,
    `aside left=${openBox.left.toFixed(1)}`,
  );

  // 遮罩存在
  const overlay = await page.locator("div.fixed.inset-0.z-40").count();
  report("打开态出现全屏遮罩", overlay === 1);

  // 点击遮罩关闭
  await page.locator("div.fixed.inset-0.z-40").click({ position: { x: 340, y: 400 } });
  await page.waitForTimeout(450);
  const closedBox = await page.locator("aside[aria-label='主导航']").evaluate((el) => el.getBoundingClientRect().right);
  report("点遮罩后抽屉滑出（右缘 ≤ 0）", closedBox <= 0.5, `aside right=${closedBox.toFixed(1)}`);

  // 桌面视口回归：侧边栏仍在文档流正常显示
  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await deskCtx.addCookies([{ name: "pwb_guest", value: "1", url: BASE }]);
  const dpage = await deskCtx.newPage();
  await dpage.goto(`${BASE}/tasks`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await dpage.waitForSelector("aside[aria-label='主导航']", { timeout: 30000 });
  await dpage.waitForTimeout(600);
  const deskBox = await dpage.locator("aside[aria-label='主导航']").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const pos = getComputedStyle(el).position;
    return { left: r.left, width: r.width, position: pos };
  });
  report(
    "桌面端侧边栏正常显示（static、贴左、宽≈260）",
    deskBox.position === "static" && Math.abs(deskBox.left) < 1 && Math.abs(deskBox.width - 260) < 4,
    `position=${deskBox.position} left=${deskBox.left.toFixed(1)} width=${deskBox.width.toFixed(1)}`,
  );
  await deskCtx.close();
} catch (err) {
  report("脚本执行异常", false, String(err).slice(0, 200));
}

if (errors.length) report("页面 JS 错误", false, errors.slice(0, 2).join(" | "));

const failed = results.filter((r) => !r.ok).length;
console.log(`\n结果: ${results.length - failed}/${results.length} 通过`);
await browser.close();
process.exit(failed ? 1 : 0);
