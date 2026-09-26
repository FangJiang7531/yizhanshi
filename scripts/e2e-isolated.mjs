// 逐用例隔离的 E2E 驱动：每个用例独立 Playwright 进程 + 外层超时。
// 背景：本机 Windows 上 Playwright driver 偶发冻结（连 30s 的 test timeout 都不触发），
// 逐用例隔离可把冻结影响限制在单个用例内（记为 WEDGE，可重试一次）。
import { spawn, spawnSync } from "node:child_process";

const TESTS = ["A", "B", "C", "D", "E", "F", "G"];
const PER_TEST_TIMEOUT_MS = 240_000;

const ENV = {
  ...process.env,
  E2E_BASE_URL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3210",
  E2E_CAPTURE_CODE: "1",
  RATE_LIMIT_DISABLED: "1",
  NEXT_DIST_DIR: ".next-e2e",
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ??
    "postgresql://pwb:pwb_dev_password@localhost:5433/personal_workbench_dev",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret-0123456789abcdef0123456789abcdef",
};

function sh(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: process.platform === "win32", env: ENV, ...opts });
    let out = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      child.kill();
      try {
        if (process.platform === "win32") spawnSync("taskkill", ["/F", "/IM", "chrome-headless-shell.exe"]);
      } catch {}
      resolve({ code: -1, out: out + "\n[WEDGE] 外层超时" });
    }, PER_TEST_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out });
    });
  });
}

async function main() {
  const results = [];
  for (const name of TESTS) {
    process.stdout.write(`▶ 用例 ${name} … `);
    const { code, out } = await sh("npx.cmd", ["playwright", "test", "-g", `${name}\\.`]);
    const ok = code === 0;
    const wedged = out.includes("[WEDGE]");
    results.push({ name, ok, wedged });
    console.log(ok ? "PASS" : wedged ? "WEDGE" : "FAIL");
    if (!ok && !wedged) {
      const tail = out.split("\n").filter(Boolean).slice(-12).join("\n");
      console.log("  └─ 失败详情:\n" + tail.split("\n").map((l) => "    " + l).join("\n"));
    }
  }

  // WEDGE 的用例重试一次
  for (const r of results.filter((r) => r.wedged)) {
    process.stdout.write(`↻ 重试用例 ${r.name} … `);
    const { code } = await sh("npx.cmd", ["playwright", "test", "-g", `${r.name}\\.`]);
    r.ok = code === 0;
    r.wedged = false;
    console.log(r.ok ? "PASS(重试)" : "FAIL(重试)");
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n===== E2E 隔离汇总 =====");
  for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.name}`);
  console.log(failed.length === 0 ? "全部通过" : `${failed.length} 个失败: ${failed.map((f) => f.name).join(", ")}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
