import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { createHabitRepository } from "@/modules/habits/repositories/habit-repository";
import { createHabitService } from "@/modules/habits/services/habit-service";
import { NotFoundError } from "@/lib/errors";
import { nextDay, previousDay } from "@/lib/date/timezone";
import { prisma, resetDb, setupTestDb, uniqueUser } from "./helpers/db";

/**
 * 习惯模块集成测试（真实 PostgreSQL，施工手册 Step 3.5 + PRD B-13）。
 */
const habitRepo = createHabitRepository();
const habitService = createHabitService();

const TODAY = "2026-10-05";

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

describe("习惯模块 · 打卡幂等与数据隔离", () => {
  it("打卡 → 数据库中产生一条 HabitLog，logDate 为用户本地日期", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    const habit = await habitService.createHabit(
      { userId: user.id },
      { name: "阅读", color: "#4A7C59", icon: "book-open", targetPerWeek: 7 },
    );

    await habitService.toggleLog({ userId: user.id, today: TODAY }, habit.id, TODAY);

    const logs = await prisma.habitLog.findMany({ where: { habitId: habit.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.logDate.toISOString().slice(0, 10)).toBe(TODAY);
  });

  it("B-13 同一习惯同一日期打卡两次 → 只有一条记录（幂等 upsert + 唯一约束兜底）", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    const habit = await habitService.createHabit(
      { userId: user.id },
      { name: "喝水", color: "#5B7A9D", icon: "droplets", targetPerWeek: 7 },
    );

    // 两次“打卡”动作（toggle 切换语义之下，幂等性由 upsertLog + @@unique 保证）
    await habitRepo.upsertLog(habit.id, user.id, TODAY);
    await habitRepo.upsertLog(habit.id, user.id, TODAY);

    expect(await prisma.habitLog.count({ where: { habitId: habit.id } })).toBe(1);
  });

  it("打卡后取消 → 记录被删除", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    const habit = await habitService.createHabit(
      { userId: user.id },
      { name: "跑步", color: "#4A7C59", icon: "footprints", targetPerWeek: 7 },
    );

    await habitService.toggleLog({ userId: user.id, today: TODAY }, habit.id, TODAY);
    const after = await habitService.toggleLog({ userId: user.id, today: TODAY }, habit.id, TODAY);
    expect(after.checked).toBe(false);
    expect(await prisma.habitLog.count({ where: { habitId: habit.id } })).toBe(0);
  });

  it("用户 A 无法为用户 B 的习惯打卡（NotFoundError，不泄漏存在性）", async () => {
    const ua = uniqueUser("a");
    const ub = uniqueUser("b");
    const userA = await createUser(ua.username, ua.email);
    const userB = await createUser(ub.username, ub.email);

    const habitOfA = await habitService.createHabit(
      { userId: userA.id },
      { name: "A 的习惯", color: "#4A7C59", icon: "flame", targetPerWeek: 7 },
    );

    await expect(
      habitService.toggleLog({ userId: userB.id, today: TODAY }, habitOfA.id, TODAY),
    ).rejects.toThrow(NotFoundError);

    expect(await prisma.habitLog.count({ where: { habitId: habitOfA.id } })).toBe(0);
  });

  it("连续打卡 5 天后查询，currentStreak = 5（端到端 streak 正确）", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    const habit = await habitService.createHabit(
      { userId: user.id },
      { name: "冥想", color: "#6366F1", icon: "brain", targetPerWeek: 7 },
    );

    let last = { currentStreak: 0, longestStreak: 0, completionRate: 0, checked: false, habitId: habit.id };
    let cursor = "2026-10-01";
    for (let i = 0; i < 5; i++) {
      last = await habitService.toggleLog({ userId: user.id, today: TODAY }, habit.id, cursor);
      cursor = nextDay(cursor);
    }

    expect(last.currentStreak).toBe(5);
    expect(last.longestStreak).toBe(5);
  });

  it("列表统计：连续/最长/完成率与当月热力图数据一次取齐", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    const habit = await habitService.createHabit(
      { userId: user.id },
      { name: "英语", color: "#C08A3E", icon: "languages", targetPerWeek: 7 },
    );

    // 本月 1、2、3 号 + 昨天（4 号）、今天（5 号）
    for (const d of ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]) {
      await habitRepo.upsertLog(habit.id, user.id, d);
    }

    const list = await habitService.listHabits({ principal: { userId: user.id, isGuest: false }, today: TODAY });
    expect(list).toHaveLength(1);
    const h = list[0];
    expect(h?.currentStreak).toBe(5);
    expect(h?.longestStreak).toBe(5);
    expect(h?.completionRate).toBe(100);
    expect(h?.checkedToday).toBe(true);
    expect(h?.monthDates).toContain("2026-10-05");
  });

  it("中断后重新打卡：当前连续重置为 1，最长连续保留", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    const habit = await habitService.createHabit(
      { userId: user.id },
      { name: "早起", color: "#4A7C59", icon: "sun", targetPerWeek: 7 },
    );

    // 10/1–10/3 连续 3 天，10/4 断，10/5 打卡
    for (const d of ["2026-10-01", "2026-10-02", "2026-10-03"]) {
      await habitRepo.upsertLog(habit.id, user.id, d);
    }
    const result = await habitService.toggleLog({ userId: user.id, today: TODAY }, habit.id, TODAY);

    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(3);
  });

  it("归档习惯不出现在待打卡列表，但历史数据保留", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    const habit = await habitService.createHabit(
      { userId: user.id },
      { name: "旧习惯", color: "#4A7C59", icon: "flame", targetPerWeek: 7 },
    );
    await habitRepo.upsertLog(habit.id, user.id, previousDay(TODAY));

    await habitService.archiveHabit({ userId: user.id }, habit.id, true);

    const list = await habitService.listHabits({ principal: { userId: user.id, isGuest: false }, today: TODAY });
    expect(list).toHaveLength(0);
    expect(await prisma.habitLog.count({ where: { habitId: habit.id } })).toBe(1);
  });

  it("恢复归档：习惯回到主列表，历史打卡数据完整保留", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    const habit = await habitService.createHabit(
      { userId: user.id },
      { name: "暂停一段", color: "#4A7C59", icon: "sprout", targetPerWeek: 7 },
    );
    await habitRepo.upsertLog(habit.id, user.id, previousDay(TODAY));

    // 归档 → 主列表消失、出现在归档列表
    await habitService.archiveHabit({ userId: user.id }, habit.id, true);
    const activeAfterArchive = await habitService.listHabits({ principal: { userId: user.id, isGuest: false }, today: TODAY });
    const archived = await habitService.listArchivedHabits({ userId: user.id });
    expect(activeAfterArchive).toHaveLength(0);
    expect(archived.map((h) => h.id)).toContain(habit.id);

    // 恢复 → 主列表回来，历史打卡保留
    await habitService.archiveHabit({ userId: user.id }, habit.id, false);
    const activeAfterRestore = await habitService.listHabits({ principal: { userId: user.id, isGuest: false }, today: TODAY });
    expect(activeAfterRestore.map((h) => h.id)).toContain(habit.id);
    expect(await prisma.habitLog.count({ where: { habitId: habit.id } })).toBe(1);
    const archivedAfter = await habitService.listArchivedHabits({ userId: user.id });
    expect(archivedAfter.map((h) => h.id)).not.toContain(habit.id);
  });

  it("软删除习惯：列表消失，历史记录保留在库中（PRD §5.2.3 语义）", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    const habit = await habitService.createHabit(
      { userId: user.id },
      { name: "将删除", color: "#4A7C59", icon: "flame", targetPerWeek: 7 },
    );
    await habitRepo.upsertLog(habit.id, user.id, TODAY);

    await habitService.deleteHabit({ userId: user.id }, habit.id);

    const list = await habitService.listHabits({ principal: { userId: user.id, isGuest: false }, today: TODAY });
    expect(list).toHaveLength(0);
    expect(await prisma.habitLog.count({ where: { habitId: habit.id } })).toBe(1);
    const raw = await prisma.habit.findUnique({ where: { id: habit.id } });
    expect(raw?.deletedAt).not.toBeNull();
  });

  it("当月热力图数据：一次查询返回该用户该月全部打卡记录（无 N+1）", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    const h1 = await habitService.createHabit({ userId: user.id }, { name: "H1", color: "#4A7C59", icon: "flame", targetPerWeek: 7 });
    const h2 = await habitService.createHabit({ userId: user.id }, { name: "H2", color: "#5B7A9D", icon: "droplets", targetPerWeek: 7 });

    for (const d of ["2026-10-01", "2026-10-02"]) {
      await habitRepo.upsertLog(h1.id, user.id, d);
      await habitRepo.upsertLog(h2.id, user.id, d);
    }

    const logs = await habitRepo.findLogsInMonth(user.id, "2026-10-01", "2026-10-31");
    expect(logs).toHaveLength(4);
  });

  it("补打过去日期允许，未来日期被 Action 层校验拒绝", async () => {
    const u = uniqueUser("a");
    const user = await createUser(u.username, u.email);
    const habit = await habitService.createHabit(
      { userId: user.id },
      { name: "补打", color: "#4A7C59", icon: "flame", targetPerWeek: 7 },
    );

    await habitService.toggleLog({ userId: user.id, today: TODAY }, habit.id, "2026-10-01");
    expect(await prisma.habitLog.count({ where: { habitId: habit.id } })).toBe(1);

    expect(() => habitService.validateLogDate("2026-10-06", TODAY)).toThrow(/未来/);
  });
});
