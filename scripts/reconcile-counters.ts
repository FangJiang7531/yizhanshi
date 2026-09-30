/**
 * 计数对账 CLI（制作流程 Step 2.3）。
 *
 * 用法：
 *   npx tsx scripts/reconcile-counters.ts          # 只报告（dry-run，默认）
 *   npx tsx scripts/reconcile-counters.ts --fix    # 检出并修正
 *
 * 建议由 JobRunner 每日定时以 --fix 执行；人工排查时先用默认模式观察漂移规模。
 * 核心逻辑位于 src/modules/blog/services/counter-reconcile.ts（可被单测覆盖）。
 */
import { reconcileCounters } from "@/modules/blog/services/counter-reconcile";
import { prisma } from "@/lib/db";

async function main(): Promise<void> {
  const fix = process.argv.includes("--fix");
  const result = await reconcileCounters({ fix });

  console.log(`\n📊 计数对账：扫描 ${result.scanned} 篇文章`);
  if (result.drifted.length === 0) {
    console.log("✅ 未发现计数漂移，冗余计数与明细表完全一致。\n");
    return;
  }

  console.warn(`⚠️  发现 ${result.drifted.length} 处漂移：`);
  for (const row of result.drifted) {
    console.warn(
      `   - [${row.kind}] ${row.label} (${row.id})  冗余=${row.redundant} 实际=${row.actual}`,
    );
  }
  if (fix) {
    console.warn(`🔧 已修正 ${result.fixed} 处。\n`);
  } else {
    console.warn("ℹ️  当前为 dry-run，未做任何修改。加 --fix 可修正。\n");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err: unknown) => {
    console.error("对账脚本执行失败：", err);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
