/**
 * Next.js 启动钩子（Next 15 稳定特性，无需 experimental 开关）。
 *
 * 职责：把敏感词库预热到内存，使首个请求不必等待词库查询。
 * 容错原则：启动期数据库可能尚未就绪（如 `next build` 阶段、容器冷启顺序问题），
 * 预加载失败**不得阻断启动**——审核入口还有 `ensureSensitiveWordsLoaded()` 惰性兜底。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { logger } = await import("@/lib/logger");
  try {
    const { loadSensitiveWords } = await import("@/modules/blog/lib/sensitive-filter");
    const count = await loadSensitiveWords();
    logger.info({ count }, "敏感词库已预热");
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "敏感词库预加载失败，将由审核入口的惰性加载兜底",
    );
  }
}
