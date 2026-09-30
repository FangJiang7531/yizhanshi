import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Action 层结构性守卫（Gate 4.1 + PRD §10.6「不得关闭检查项」）。
 *
 * 为什么要用源码断言而不是行为测试：
 * 行为测试只能覆盖"我想到的调用方式"，而"某个 Action 忘了写权限守卫"
 * 恰恰是最容易在后续迭代中悄悄引入、且行为测试难以穷举的缺陷。
 * 这里对**结构**做断言，任何新增 Action 都会被自动纳入检查，漏写守卫会直接红。
 *
 * 补充说明：真正的权限行为由 M11 的 E2E 覆盖（访客调用写 Action 应被拒），
 * 本文件只是成本极低的第一道网。
 */
const ACTIONS_DIR = join(process.cwd(), "src/modules/blog/actions");

/** 视为"权限守卫"的调用（其中之一必须出现在 Action 体内） */
const GUARD_PATTERNS = [/requireNonGuest\(/, /requireRole\(/, /requireAuth\(/, /getPrincipal\(/];

/**
 * 无一例外：Gate 4.1 判据 1 要求"每个 Action 第一行都是权限守卫"。
 * 连浏览计数这种对访客开放的接口也要读 principal —— 它的实际用途是
 * 决定浏览去重口径（登录按 userId、访客按 IP+UA），而不是放行/拦截。
 */

function listActionFiles(): string[] {
  return readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".actions.ts"));
}

type ActionBlock = { name: string; body: string; file: string };

function parseActions(): ActionBlock[] {
  const blocks: ActionBlock[] = [];
  for (const file of listActionFiles()) {
    const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
    const starts = [...source.matchAll(/export async function (\w+)/g)];
    starts.forEach((match, i) => {
      const name = match[1]!;
      const from = match.index!;
      const to = i + 1 < starts.length ? starts[i + 1]!.index! : source.length;
      blocks.push({ name, body: source.slice(from, to), file });
    });
  }
  return blocks;
}

describe("Gate 4.1 · Action 层结构守卫", () => {
  it("actions 目录下每个文件都以 \"use server\" 开头", () => {
    const files = listActionFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
      expect(source.trimStart().startsWith('"use server"'), `${file} 缺少 "use server"`).toBe(true);
    }
  });

  it("每个 Action 都有权限守卫（Gate 4.1 判据 1）", () => {
    const blocks = parseActions();
    expect(blocks.length).toBeGreaterThan(10);

    const missing = blocks
      .filter((b) => !GUARD_PATTERNS.some((p) => p.test(b.body)))
      .map((b) => `${b.file}::${b.name}`);

    expect(missing, `以下 Action 缺少权限守卫：${missing.join(", ")}`).toEqual([]);
  });

  it("每个需要输入的 Action 都做 Zod 校验（Gate 4.1 判据 2）", () => {
    const blocks = parseActions();
    // 无参 Action（不需要输入校验）
    const noInputActions = new Set([
      "createDraftAction",
      "mineStatsAction",
      "listModerationQueueAction",
      "listPendingCommentsAction",
      "getInteractionCapabilityAction",
      "getViewerIdentityAction",
      "getImageQuotaAction",
    ]);

    const missing = blocks
      .filter((b) => !noInputActions.has(b.name))
      .filter((b) => !/\.parse\(/.test(b.body))
      .map((b) => `${b.file}::${b.name}`);

    expect(missing, `以下 Action 缺少 Zod 校验：${missing.join(", ")}`).toEqual([]);
  });

  it("Action 体内不出现任何关闭检查项的指令（PRD §10.6 判据 3）", () => {
    for (const file of listActionFiles()) {
      const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
      expect(source, `${file} 含 @ts-ignore`).not.toMatch(/@ts-ignore/);
      expect(source, `${file} 含 @ts-nocheck`).not.toMatch(/@ts-nocheck/);
      // eslint-disable 仅允许用于说明性场景（当前不应存在）
      expect(source, `${file} 含 eslint-disable`).not.toMatch(/eslint-disable/);
    }
  });

  it("写操作 Action 都调用了服务层（控制器不直接碰数据库）", () => {
    const blocks = parseActions();
    const writeActions = blocks.filter((b) =>
      /^(saveDraft|publishPost|archivePost|unarchivePost|deletePost|updateSlug|createComment|deleteComment|toggleLike|toggleRepost|toggleCommentLike|share|moderatePost|reviewComment|createDraft|uploadBlogImage)/.test(
        b.name,
      ),
    );
    expect(writeActions.length).toBeGreaterThan(8);

    for (const b of writeActions) {
      expect(
        /create(Post|Comment|Counter|BlogImage)Service\(/.test(b.body),
        `${b.name} 未通过服务层写入`,
      ).toBe(true);
    }
  });
});
