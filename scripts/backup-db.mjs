// 迁移前备份：内嵌 PostgreSQL 无 pg_dump 客户端，用 node pg 驱动导出全部业务表数据为 JSON。
// 用法：node scripts/backup-db.mjs [输出文件]（默认 backups/backup_pre_blog_<时间戳>.json）
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] ?? join(projectRoot, "backups", `backup_pre_blog_${Date.now()}.json`);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[backup] 缺少 DATABASE_URL");
  process.exit(1);
}

const c = new Client({ connectionString: url });
await c.connect();

// 按依赖序导出（父表在前，恢复时可按序回插）
const TABLES = [
  "User",
  "Session",
  "VerificationCode",
  "UserSetting",
  "AuthAccount",
  "RateLimitBucket",
  "Job",
  "Task",
  "Tag",
  "TaskTag",
  "Habit",
  "HabitLog",
  "BlogPost",
  "Comment",
];

const dump = { exportedAt: new Date().toISOString(), database: url.replace(/:\/\/.*@/, "://***@"), tables: {} };
let total = 0;
for (const t of TABLES) {
  const r = await c.query(`SELECT * FROM "${t}"`);
  dump.tables[t] = r.rows;
  total += r.rows.length;
  console.log(`[backup] ${t}: ${r.rows.length} rows`);
}
await c.end();

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(dump, null, 2));
console.log(`[backup] 完成：${total} 行 → ${out}`);
if (total === 0) console.warn("[backup] 注意：数据库为空（可能未跑种子数据），备份文件仅记录表结构存在性");
