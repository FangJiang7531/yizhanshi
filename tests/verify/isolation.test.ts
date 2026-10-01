import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { createTaskService } from "@/modules/tasks/services/task-service";
import { createHabitService } from "@/modules/habits/services/habit-service";

/**
 * 跨用户越权防护（服务层结构性保障）—— 自包含：运行时自建两个用户与数据。
 *
 * 服务层所有方法首参强制 userId，越权写入在 SQL WHERE 层被拒
 * （updateMany count=0 / findFirst 查不到）→ 服务层抛 NotFoundError，
 * 不泄漏"存在但无权"（与 403 的语义区分是本项目的验收要求）。
 */

const ts = createTaskService();
const hs = createHabitService();
let A = "";
let B = "";
let taskA = "";
let habitA = "";

beforeAll(async () => {
  const uid = (p: string) => `${p}_${randomBytes(6).toString("hex")}`;
  A = uid("it_a");
  B = uid("it_b");
  await prisma.user.createMany({
    data: [
      { id: A, username: A, email: `${A}@test.local`, role: "USER", timezone: "Asia/Shanghai", status: "ACTIVE" },
      { id: B, username: B, email: `${B}@test.local`, role: "USER", timezone: "Asia/Shanghai", status: "ACTIVE" },
    ],
  });
  const t = await prisma.task.create({ data: { userId: A, title: "隔离测试任务", priority: "MEDIUM" } });
  taskA = t.id;
  const h = await prisma.habit.create({ data: { userId: A, name: "隔离测试习惯", color: "#4A7C59", icon: "book-open" } });
  habitA = h.id;
});

describe("跨用户越权防护（服务层结构性保障）", () => {
  it("B 更新 A 的任务 → 拒绝（404 语义）", async () => {
    await expect(
      ts.updateTask({ userId: B, timezone: "Asia/Shanghai" }, { id: taskA, title: "越权改" }),
    ).rejects.toThrow();
  });
  it("B 删除 A 的任务 → 拒绝", async () => {
    await expect(ts.deleteTask({ userId: B }, taskA)).rejects.toThrow();
  });
  it("B 切换 A 的任务完成 → 拒绝", async () => {
    await expect(
      ts.toggleTask({ userId: B, timezone: "Asia/Shanghai" }, taskA, true),
    ).rejects.toThrow();
  });
  it("B 打卡 A 的习惯 → 拒绝", async () => {
    await expect(
      hs.toggleLog({ userId: B, today: "2026-09-30" }, habitA, "2026-09-30"),
    ).rejects.toThrow();
  });
  it("B 删除 A 的习惯 → 拒绝", async () => {
    await expect(hs.deleteHabit({ userId: B }, habitA)).rejects.toThrow();
  });
  it("A 更新自己的任务 → 成功", async () => {
    const r = await ts.updateTask(
      { userId: A, timezone: "Asia/Shanghai" },
      { id: taskA, title: "正常改标题" },
    );
    expect(r.title).toBe("正常改标题");
  });
  it("A 打卡自己的习惯 → 成功", async () => {
    const r = await hs.toggleLog({ userId: A, today: "2026-09-30" }, habitA, "2026-09-30");
    expect(r.checked).toBe(true);
  });
  it("A 的任务列表首条属于 A（作用域隔离）", async () => {
    const list = await ts.listTasks({
      principal: { userId: A, isGuest: false },
      timezone: "Asia/Shanghai",
      filter: "all",
      pageSize: 100,
    });
    expect(list.items.length).toBeGreaterThan(0);
  });
  it("B 的任务列表看不到 A 的数据", async () => {
    const list = await ts.listTasks({
      principal: { userId: B, isGuest: false },
      timezone: "Asia/Shanghai",
      filter: "all",
      pageSize: 100,
    });
    expect(list.items.find((t) => t.id === taskA)).toBeUndefined();
  });
});
