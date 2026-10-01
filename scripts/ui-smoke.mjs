/**
 * UI 交互冒烟脚本（一次性验证用，非留存测试）：
 * 针对「无界化」前端优化验证关键交互在真实浏览器中可用。
 * 前提：next start -p 3100 已启动。
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const results = [];
function report(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "pwb_guest", value: "1", url: BASE }]);
const page = await ctx.newPage();
page.on("pageerror", (err) => report(`页面 JS 错误: ${err.message}`, false));

try {
  // 1. 总览页渲染 + 新外壳元素
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("aside[aria-label='主导航']", { timeout: 15000 });
  report("总览页渲染（侧边栏挂载）", true);
  report(
    "命令面板触发入口存在",
    (await page.getByText("搜索或跳转…").count()) === 1,
  );
  report(
    "总览柔光晕锚点存在",
    (await page.locator(".dashboard-aurora").count()) === 1,
  );

  // 2. 侧边栏分组折叠：工具组默认收起 → 点击展开 → 条目可见
  const toolsBtn = page.locator("aside button", { hasText: "工具" });
  await toolsBtn.click();
  await page.waitForTimeout(350);
  const docConverterLink = page.locator("aside a", { hasText: "文档转换" });
  report(
    "分组折叠/展开可用（工具组）",
    await docConverterLink.isVisible(),
  );

  // 3. 侧边栏折叠为轨道
  await page.getByLabel("折叠侧边栏").click();
  await page.waitForTimeout(350);
  const asideWidth = await page.locator("aside").evaluate((el) => el.getBoundingClientRect().width);
  report("侧边栏折叠为 64px 轨道", Math.abs(asideWidth - 64) < 2, `width=${asideWidth}`);
  await page.getByLabel("展开侧边栏").click();
  await page.waitForTimeout(350);

  // 4. 命令面板：Ctrl+K 唤起 → 输入过滤 → Enter 跳转
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  const paletteInput = page.getByPlaceholder("搜索页面或操作…");
  report("Ctrl+K 唤起命令面板", await paletteInput.isVisible());
  await paletteInput.fill("习惯");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForURL("**/habits**", { timeout: 8000 });
  report("命令面板过滤并跳转习惯打卡", page.url().includes("/habits"), page.url());

  // 5. 命令面板操作：新建习惯 → ?create=1 自动打开对话框
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  await page.getByPlaceholder("搜索页面或操作…").fill("新建习惯");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  // 访客模式下会先弹「访客提示」对话框，说明命令正确触发了新建流程
  const guestDialog = await page.getByText("访客模式").count();
  const habitDialog = await page.locator("[role='dialog']").count();
  report(
    "「新建习惯」命令触发新建流程（访客弹提示/登录态弹表单）",
    guestDialog + habitDialog > 0,
  );
  await page.keyboard.press("Escape");

  // 6. 主题切换（命令面板 → 切换主题）
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  await page.getByPlaceholder("搜索页面或操作…").fill("切换主题");
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  report("命令面板切换主题", before !== after, `${before} → ${after}`);

  // 7. 板块切换无白屏、内容定宽生效
  await page.click("aside a:has-text('任务清单')");
  await page.waitForURL("**/tasks**", { timeout: 8000 });
  await page.waitForTimeout(400);
  const tasksWidth = await page.locator("main").evaluate((el) => el.style.maxWidth);
  report("任务页内容定宽（工作型）", tasksWidth.includes("work-width"), tasksWidth);

  // 8. 桌面截图
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/ui-smoke-dashboard.png", fullPage: false });
  await page.goto(`${BASE}/habits`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/ui-smoke-habits.png", fullPage: false });
  report("桌面截图已产出", true);

  // 9. 移动端视口：底部标签栏 + 更多抽屉
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mctx.addCookies([{ name: "pwb_guest", value: "1", url: BASE }]);
  const mpage = await mctx.newPage();
  await mpage.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await mpage.waitForSelector("nav[aria-label='移动端主导航']", { timeout: 15000 });
  report("移动端底部标签栏渲染", true);
  const tabCount = await mpage.locator("nav[aria-label='移动端主导航'] li").count();
  report("底部标签栏 4 主入口 + 更多", tabCount === 5, `tabs=${tabCount}`);
  await mpage.getByLabel("打开全部板块").click();
  await mpage.waitForTimeout(400);
  const drawerVisible = await mpage.locator("aside[data-mobile-open='true']").isVisible();
  report("「更多」打开全量抽屉", drawerVisible);
  await mpage.screenshot({ path: "test-results/ui-smoke-mobile.png" });
  await mctx.close();
} catch (err) {
  report(`执行异常: ${err.message}`, false);
} finally {
  await ctx.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n===== UI 冒烟结果：${results.length - failed.length}/${results.length} 通过 =====`);
process.exit(failed.length > 0 ? 1 : 0);
