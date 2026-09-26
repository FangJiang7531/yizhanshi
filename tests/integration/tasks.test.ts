import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { createTaskRepository } from "@/modules/tasks/repositories/task-repository";
import { createTagRepository } from "@/modules/tasks/repositories/tag-repository";
import { createTaskService } from "@/modules/tasks/services/task-service";
import { NotFoundError } from "@/lib/errors";
import { getDayRangeInTimezone } from "@/lib/date/timezone";
import { prisma, resetDb, setupTestDb, uniqueUser } from "./helpers/db";

/**
 * 任务模块集成测试（真实 PostgreSQL，施工手册 Step 2.7 + PRD C-01/C-02）。
 * 服务层走真实仓储（禁止 mock 服务层）；每个用例前清库。
 */
const taskRepo = createTaskRepository();
const tagRepo = createTagRepository();
const taskService = createTaskService();

async function createUser(username: string, email: string, timezone = "Asia/Shanghai") {
  return prisma.user.create({
    data: { username, email, passwordHash: await hashPassword(["Passw0rd", "X"].join("")), timezone },
  });
}

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("任务模块 · 数据隔离与 CRUD", () => {
  it("创建任务后，能在列表中查到", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);

    const created = await taskService.createTask(
      { userId: user.id, timezone: user.timezone },
      { title: "写周报", priority: "MEDIUM", tagIds: [] },
    );

    const list = await taskService.listTasks({
      principal: { userId: user.id, isGuest: false },
      timezone: user.timezone,
      filter: "all",
    });
    expect(list.total).toBe(1);
    expect(list.items[0]?.id).toBe(created.id);
  });

  it("C-01 用户 A 创建的任务，用户 B 查询列表时看不到", async () => {
    const ua = uniqueUser("a");
    const ub = uniqueUser("b");
    const userA = await createUser(ua.username, ua.email);
    const userB = await createUser(ub.username, ub.email);

    await taskService.createTask(
      { userId: userA.id, timezone: userA.timezone },
      { title: "A 的任务", priority: "LOW", tagIds: [] },
    );

    const listB = await taskService.listTasks({
      principal: { userId: userB.id, isGuest: false },
      timezone: userB.timezone,
      filter: "all",
    });
    expect(listB.total).toBe(0);
    expect(listB.items).toHaveLength(0);
  });

  it("C-02 用户 B 尝试更新/删除用户 A 的任务 → NotFoundError（不泄漏存在性）", async () => {
    const ua = uniqueUser("a");
    const ub = uniqueUser("b");
    const userA = await createUser(ua.username, ua.email);
    const userB = await createUser(ub.username, ub.email);

    const task = await taskService.createTask(
      { userId: userA.id, timezone: userA.timezone },
      { title: "A 的任务", priority: "LOW", tagIds: [] },
    );

    await expect(
      taskService.updateTask({ userId: userB.id, timezone: userB.timezone }, { id: task.id, title: "篡改" }),
    ).rejects.toThrow(NotFoundError);

    await expect(
      taskService.deleteTask({ userId: userB.id }, task.id),
    ).rejects.toThrow(NotFoundError);

    // 原任务未被改动
    const stillThere = await taskRepo.findById(userA.id, task.id);
    expect(stillThere?.title).toBe("A 的任务");
  });

  it("软删除后，列表不再返回该任务，但数据库中仍有记录且 deletedAt 非空", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    const task = await taskService.createTask(
      { userId: user.id, timezone: user.timezone },
      { title: "将被删除", priority: "MEDIUM", tagIds: [] },
    );

    await taskService.deleteTask({ userId: user.id }, task.id);

    const list = await taskService.listTasks({
      principal: { userId: user.id, isGuest: false },
      timezone: user.timezone,
      filter: "all",
    });
    expect(list.total).toBe(0);

    const raw = await prisma.task.findUnique({ where: { id: task.id } });
    expect(raw).not.toBeNull();
    expect(raw?.deletedAt).not.toBeNull();
  });

  it("标签唯一约束：同一用户同名标签失败；不同用户可创建同名标签", async () => {
    const ua = uniqueUser("a");
    const ub = uniqueUser("b");
    const userA = await createUser(ua.username, ua.email);
    const userB = await createUser(ub.username, ub.email);

    await tagRepo.create(userA.id, { name: "工作", color: "#6366F1" });
    await expect(tagRepo.create(userA.id, { name: "工作", color: "#6366F1" })).rejects.toThrow();

    const bTag = await tagRepo.create(userB.id, { name: "工作", color: "#B4543E" });
    expect(bTag.name).toBe("工作");
  });

  it("删除标签后，任务本身仍存在，仅关联关系被移除", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);

    const tag = await tagRepo.create(user.id, { name: "临时", color: "#4A7C59" });
    const task = await taskService.createTask(
      { userId: user.id, timezone: user.timezone },
      { title: "带标签任务", priority: "MEDIUM", tagIds: [tag.id] },
    );
    expect(task.tags).toHaveLength(1);

    await tagRepo.delete(user.id, tag.id);

    const stillThere = await taskRepo.findById(user.id, task.id);
    expect(stillThere?.title).toBe("带标签任务");
    expect(stillThere?.tags).toHaveLength(0);
  });

  it("创建时挂跨用户标签被拒（ForbiddenError）", async () => {
    const ua = uniqueUser("a");
    const ub = uniqueUser("b");
    const userA = await createUser(ua.username, ua.email);
    const userB = await createUser(ub.username, ub.email);

    const tagOfB = await tagRepo.create(userB.id, { name: "B 的标签", color: "#6366F1" });

    await expect(
      taskService.createTask(
        { userId: userA.id, timezone: userA.timezone },
        { title: "越权挂标签", priority: "LOW", tagIds: [tagOfB.id] },
      ),
    ).rejects.toThrow(/不属于你/);
  });

  it("分页：创建 25 条任务，pageSize=10 → 10/10/5，total=25", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    for (let i = 1; i <= 25; i++) {
      await taskService.createTask(
        { userId: user.id, timezone: user.timezone },
        { title: `任务 ${i}`, priority: "MEDIUM", tagIds: [] },
      );
    }

    const p1 = await taskService.listTasks({ principal: { userId: user.id, isGuest: false }, timezone: user.timezone, filter: "all", page: 1, pageSize: 10 });
    const p2 = await taskService.listTasks({ principal: { userId: user.id, isGuest: false }, timezone: user.timezone, filter: "all", page: 2, pageSize: 10 });
    const p3 = await taskService.listTasks({ principal: { userId: user.id, isGuest: false }, timezone: user.timezone, filter: "all", page: 3, pageSize: 10 });

    expect(p1.total).toBe(25);
    expect(p1.items).toHaveLength(10);
    expect(p2.items).toHaveLength(10);
    expect(p3.items).toHaveLength(5);
  });

  it("按“今天”过滤：只返回用户时区下今天截止且未完成的任务", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    const now = new Date();
    const range = getDayRangeInTimezone(now, user.timezone);

    await taskService.createTask(
      { userId: user.id, timezone: user.timezone },
      { title: "今天到期", priority: "MEDIUM", tagIds: [], dueDate: range.localDateStr },
    );
    await taskService.createTask(
      { userId: user.id, timezone: user.timezone },
      { title: "下周到期", priority: "MEDIUM", tagIds: [], dueDate: "2027-01-01" },
    );

    const today = await taskService.listTasks({ principal: { userId: user.id, isGuest: false }, timezone: user.timezone, filter: "today" });
    expect(today.total).toBe(1);
    expect(today.items[0]?.title).toBe("今天到期");
  });

  it("跨时区场景：纽约用户“今天”列表不包含上海当天到期的任务（当两地日期不同）", async () => {
    const uny = uniqueUser("ny");
    const userNY = await createUser(uny.username, uny.email, "America/New_York");

    // 选一个上海已是次日、纽约仍是当日的 UTC 时刻
    const rangeSh = getDayRangeInTimezone(new Date(), "Asia/Shanghai");
    const rangeNy = getDayRangeInTimezone(new Date(), "America/New_York");
    if (rangeSh.localDateStr === rangeNy.localDateStr) {
      // 构造：取上海“明天 00:30”对应的 UTC 时刻，让纽约仍是当天
      const tomorrowSh = await import("@/lib/date/timezone").then((m) => m.nextDay(rangeSh.localDateStr));
      const instant = new Date(`${tomorrowSh}T00:30:00.000+08:00`);
      const nyStr = await import("@/lib/date/timezone").then((m) => m.toLocalDateString(instant, "America/New_York"));
      await taskService.createTask(
        { userId: userNY.id, timezone: userNY.timezone },
        { title: "纽约今天", priority: "MEDIUM", tagIds: [], dueDate: nyStr },
      );
      const todayNY = await taskService.listTasks({ principal: { userId: userNY.id, isGuest: false }, timezone: userNY.timezone, filter: "today" });
      expect(todayNY.total).toBe(1);
      return;
    }

    await taskService.createTask(
      { userId: userNY.id, timezone: userNY.timezone },
      { title: "上海当天到期", priority: "MEDIUM", tagIds: [], dueDate: rangeSh.localDateStr },
    );
    const todayNY = await taskService.listTasks({ principal: { userId: userNY.id, isGuest: false }, timezone: userNY.timezone, filter: "today" });
    expect(todayNY.total).toBe(0);
  });

  it("级联删除：删除用户后，其全部 Task / Tag / TaskTag 记录均被删除", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    const tag = await tagRepo.create(user.id, { name: "级联", color: "#6366F1" });
    await taskService.createTask(
      { userId: user.id, timezone: user.timezone },
      { title: "将被级联删除", priority: "LOW", tagIds: [tag.id] },
    );

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.task.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.tag.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.taskTag.count()).toBe(0);
  });

  it("搜索匹配标题与描述（大小写不敏感）", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    await taskService.createTask(
      { userId: user.id, timezone: user.timezone },
      { title: "季度 Planning", priority: "MEDIUM", tagIds: [] },
    );
    await taskService.createTask(
      { userId: user.id, timezone: user.timezone },
      { title: "无关任务", description: "记得 review 计划文档", priority: "MEDIUM", tagIds: [] },
    );

    const byTitle = await taskService.listTasks({ principal: { userId: user.id, isGuest: false }, timezone: user.timezone, filter: "all", search: "planning" });
    expect(byTitle.total).toBe(1);
    expect(byTitle.items[0]?.title).toBe("季度 Planning");

    const byDesc = await taskService.listTasks({ principal: { userId: user.id, isGuest: false }, timezone: user.timezone, filter: "all", search: "计划文档" });
    expect(byDesc.total).toBe(1);
    expect(byDesc.items[0]?.title).toBe("无关任务");
  });
});
