import { ensureSensitiveWordsLoaded, sensitiveFilter, type Hit, type Level } from "../lib/sensitive-filter";

/**
 * 内容审核服务（PRD §6.1 / 制作流程 Step 1.1 的调用面）。
 *
 * 审核覆盖六个入口：文章标题、摘要、正文、标签名、评论内容、转发语。
 * 本模块把它们统一成一个"多字段审核"入口，避免每个入口各写一遍分级判定，
 * 也避免出现"某个入口忘了接审核"这类静默失效。
 *
 * 分级（PRD §6.2）：
 * - BLOCK  → blocked = true，调用方必须拒绝写入；
 * - REVIEW → hasReview = true，调用方转人工审核队列（状态置 REVIEW / PENDING）；
 * - MASK   → 自动替换为 `***` 后放行，`masked` 里给出替换后的文本。
 */

export type AuditField = {
  /** 命中位置的归属字段（title / excerpt / content / tag[0] / comment / repostComment） */
  field: string;
  text: string;
};

export type AuditOutcome = {
  /** 全部命中（已带 field 标注），供前端高亮与 AuditRecord 存档 */
  hits: HitWithField[];
  blocked: boolean;
  hasReview: boolean;
  /** field → MASK 替换后的文本（仅对 BLOCK/REVIEW 之外的命中做替换） */
  masked: Map<string, string>;
};

export type HitWithField = {
  word: string;
  level: Level;
  field: string;
  start: number;
  end: number;
};

/**
 * 多字段审核。返回的 `hits[].start/end` 是**该字段原文内**的下标，
 * 前端据此在对应输入框内高亮标出（PRD §6.2 BLOCK 行）。
 */
export async function auditFields(fields: AuditField[]): Promise<AuditOutcome> {
  // 防线：词库空载会让审核静默失效，这里保证至少加载过一次
  await ensureSensitiveWordsLoaded();

  const hits: HitWithField[] = [];
  const masked = new Map<string, string>();
  let blocked = false;
  let hasReview = false;

  for (const { field, text } of fields) {
    if (!text) {
      masked.set(field, text);
      continue;
    }
    const result = sensitiveFilter.process(text);
    masked.set(field, result.text);
    for (const h of result.hits) {
      hits.push({ word: h.word, level: h.level, field, start: h.start, end: h.end });
      if (h.level === "REVIEW") hasReview = true;
    }
    if (result.blocked) blocked = true;
  }

  return { hits, blocked, hasReview, masked };
}

/** 单字段便捷入口（评论 / 转发语只有一个字段，用这个更直白） */
export function auditSingle(field: string, text: string): Promise<AuditOutcome> {
  return auditFields([{ field, text }]);
}

/** 判定该文中是否存在需要人工复核的命中 */
export function hasReviewHit(outcome: AuditOutcome): boolean {
  return outcome.hasReview;
}

/** 仅保留 BLOCK 级命中（写入 ContentRejectedError 时只报最严重的一档） */
export function blockHits(outcome: AuditOutcome): HitWithField[] {
  return outcome.hits.filter((h) => h.level === "BLOCK");
}

export type { Hit };
