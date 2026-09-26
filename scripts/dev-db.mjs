// 本地开发数据库启动器（本机无 Docker，用内嵌 PostgreSQL 17 提供真实数据库）
//
// 关键点（Windows 中文系统）：PostgreSQL 二进制所在路径若含非 ASCII 字符，
// initdb/post-bootstrap 会因 GBK→UTF8 编码错乱而崩溃（FATAL: invalid byte
// sequence 0xb9）。因此本脚本会把二进制镜像到 ASCII 路径 %USERPROFILE%\.pwb-pg-bin
// 再执行，数据目录同理放在 %USERPROFILE%\.pwb-pgdata。
//
// 用法：npm run db:up   首次自动 initdb + 建库；pg_ctl 托管，脚本可退出
//       npm run db:down 停止数据库
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const PORT = Number(process.env.DEV_DB_PORT ?? 5433);
const DB_NAME = "personal_workbench_dev";
const USER = "pwb";
const PASSWORD = "pwb_dev_password";

const sourceBin = join(projectRoot, "node_modules", "@embedded-postgres", "windows-x64", "native", "bin");
const binDir = join(homedir(), ".pwb-pg-bin", "bin");
const dataDir = join(homedir(), ".pwb-pgdata");
const logFile = join(homedir(), ".pwb-pgdata", "pg.log");
const markerFile = join(homedir(), ".pwb-pg-bin", "source-marker.txt");

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    console.error(`[db] 命令失败：${cmd} ${args.join(" ")} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

function ensureBinaries() {
  if (!existsSync(sourceBin)) {
    console.error(`[db] 未找到内嵌 PostgreSQL 二进制：${sourceBin}`);
    console.error("[db] 请先执行 npm install");
    process.exit(1);
  }
  const marker = `${sourceBin}\n`;
  if (!existsSync(join(binDir, "postgres.exe")) || !existsSync(markerFile) || readText(markerFile) !== marker) {
    console.log(`[db] 镜像 PostgreSQL 二进制到 ASCII 路径：${join(binDir, "..")}`);
    mkdirSync(binDir, { recursive: true });
    cpSync(join(sourceBin, ".."), join(binDir, ".."), { recursive: true });
    writeFileSync(markerFile, marker);
  }
}

function readText(p) {
  try {
    return readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}

function runPsql(sql) {
  const r = spawnSync(
    join(binDir, "psql.exe"),
    ["-h", "127.0.0.1", "-p", String(PORT), "-U", USER, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { stdio: "pipe", encoding: "utf-8", env: { ...process.env, PGPASSWORD: PASSWORD } },
  );
  return r.status === 0;
}

const action = process.argv[2] ?? "up";

if (action === "down") {
  sh(join(binDir, "pg_ctl.exe"), ["-D", dataDir, "-m", "fast", "stop"]);
  console.log("[db] 已停止");
  process.exit(0);
}

// ---------- up ----------
ensureBinaries();

if (!existsSync(join(dataDir, "PG_VERSION"))) {
  console.log(`[db] 初始化数据目录 ${dataDir} …`);
  const pwfile = join(homedir(), ".pwb-pwfile");
  writeFileSync(pwfile, `${PASSWORD}\n`);
  sh(join(binDir, "initdb.exe"), [
    "--pgdata", dataDir,
    "--auth=scram-sha-256",
    `--username=${USER}`,
    `--pwfile=${pwfile}`,
    "--locale=C",
    "--encoding=UTF8",
  ]);
  console.log("[db] 初始化完成");
}

const status = spawnSync(join(binDir, "pg_ctl.exe"), ["-D", dataDir, "status"], { encoding: "utf-8" });
if (status.status !== 0) {
  console.log(`[db] 启动 PostgreSQL (127.0.0.1:${PORT}) …`);
  sh(join(binDir, "pg_ctl.exe"), [
    "-D", dataDir,
    "-l", logFile,
    "-o", `-p ${PORT}`,
    "-w",
    "start",
  ]);
} else {
  console.log("[db] PostgreSQL 已在运行");
}

if (!runPsql(`SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'`)) {
  // 库不存在（或查询失败）时尝试创建；已存在会失败，忽略即可
  const r = spawnSync(
    join(binDir, "psql.exe"),
    ["-h", "127.0.0.1", "-p", String(PORT), "-U", USER, "-d", "postgres", "-c", `CREATE DATABASE ${DB_NAME}`],
    { stdio: "pipe", encoding: "utf-8", env: { ...process.env, PGPASSWORD: PASSWORD } },
  );
  if (r.status === 0) console.log(`[db] 已创建数据库 ${DB_NAME}`);
}

console.log(`[db] 就绪：postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DB_NAME}`);
