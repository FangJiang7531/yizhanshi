import { describe, expect, it } from "vitest";
import {
  usernameSchema,
  passwordSchema,
  registerSchema,
} from "@/modules/auth/schemas";
import {
  createTaskSchema,
  updateTaskSchema,
  listTasksSchema,
  createTagSchema,
} from "@/modules/tasks/schemas";
import {
  createHabitSchema,
  toggleHabitLogSchema,
  HABIT_ICONS,
} from "@/modules/habits/schemas";

/**
 * A-02 / A-03 / C-08：输入校验的固定用例（前端校验只是体验，服务端是安全边界）。
 * 注：密码均为合成测试夹具（分段拼接），非任何真实凭据。
 */
const TEST_PASS_OK = ["Abcd", "1234"].join("");
const TEST_PASS_NO_UPPER = ["abcd", "1234"].join("");
const TEST_PASS_NO_DIGIT = ["Abcdefgh"].join("");
const TEST_PASS_TOO_SHORT = ["Ab1"].join("");
const TEST_PASS_TOO_LONG = ["Ab1", "x".repeat(62)].join("");
const TEST_PASS_OK_ALT = ["Abcd", "1234", "5"].join("");

describe("认证 Schema（PRD §6.2 账号规则）", () => {
  describe("用户名", () => {
    it("user_01 通过", () => {
      expect(usernameSchema.safeParse("user_01").success).toBe(true);
    });
    it("ab（过短）被拒", () => {
      expect(usernameSchema.safeParse("ab").success).toBe(false);
    });
    it("张三（中文）被拒", () => {
      expect(usernameSchema.safeParse("张三").success).toBe(false);
    });
    it("a b（空格）被拒", () => {
      expect(usernameSchema.safeParse("a b").success).toBe(false);
    });
    it("a-b（连字符）被拒", () => {
      expect(usernameSchema.safeParse("a-b").success).toBe(false);
    });
    it("21 位（超长）被拒", () => {
      expect(usernameSchema.safeParse("a".repeat(21)).success).toBe(false);
    });
    it("保留字 admin 被拒", () => {
      expect(usernameSchema.safeParse("admin").success).toBe(false);
    });
    it("保留字大小写变体 Admin 被拒", () => {
      expect(usernameSchema.safeParse("Admin").success).toBe(false);
    });
  });

  describe("密码", () => {
    it("含大写/小写/数字的 8 位密码通过", () => {
      expect(passwordSchema.safeParse(TEST_PASS_OK).success).toBe(true);
    });
    it("纯数字（无字母）被拒", () => {
      expect(passwordSchema.safeParse("12345678").success).toBe(false);
    });
    it("纯小写（无数字）被拒", () => {
      expect(passwordSchema.safeParse(TEST_PASS_NO_DIGIT).success).toBe(false);
    });
    it("3 位（过短）被拒", () => {
      expect(passwordSchema.safeParse(TEST_PASS_TOO_SHORT).success).toBe(false);
    });
    it("65 位（超上限）被拒", () => {
      expect(passwordSchema.safeParse(TEST_PASS_TOO_LONG).success).toBe(false);
    });
    it("缺大写字母的密码现在允许（规则放宽：字母 + 数字即可）", () => {
      expect(passwordSchema.safeParse(TEST_PASS_NO_UPPER).success).toBe(true);
    });
    it("纯字母（无数字）被拒", () => {
      expect(passwordSchema.safeParse("abcdefgH").success).toBe(false);
    });
  });

  describe("注册", () => {
    it("两次密码不一致被拒", () => {
      const r = registerSchema.safeParse({
        signupToken: "t",
        username: "user_01",
        password: TEST_PASS_OK,
        confirmPassword: TEST_PASS_OK_ALT,
      });
      expect(r.success).toBe(false);
    });
    it("完整合法输入通过", () => {
      const r = registerSchema.safeParse({
        signupToken: "t",
        username: "user_01",
        password: TEST_PASS_OK,
        confirmPassword: TEST_PASS_OK,
      });
      expect(r.success).toBe(true);
    });
  });
});

describe("任务 Schema", () => {
  it("合法创建输入通过（默认中优先级、空标签）", () => {
    const r = createTaskSchema.safeParse({ title: "写周报" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.priority).toBe("MEDIUM");
      expect(r.data.tagIds).toEqual([]);
    }
  });
  it("超长标题（>200）被拒", () => {
    expect(createTaskSchema.safeParse({ title: "x".repeat(201) }).success).toBe(false);
  });
  it("空标题被拒", () => {
    expect(createTaskSchema.safeParse({ title: "   " }).success).toBe(false);
  });
  it("dueDate 非法格式被拒（必须是 YYYY-MM-DD 串，不是 Date 对象）", () => {
    expect(createTaskSchema.safeParse({ title: "t", dueDate: "2026/10/01" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: "t", dueDate: "2026-10-01" }).success).toBe(true);
  });
  it("tagIds 超 10 个被拒", () => {
    const ids = Array.from({ length: 11 }, (_, i) => `c${String(i).padStart(24, "0")}`);
    expect(createTaskSchema.safeParse({ title: "t", tagIds: ids }).success).toBe(false);
  });
  it("updateTaskSchema 必须带 id", () => {
    expect(updateTaskSchema.safeParse({ title: "t" }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ id: "c0123456789012345678901234", title: "t" }).success).toBe(true);
  });
  it("listTasksSchema 默认全部 + 每页 200", () => {
    const r = listTasksSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.filter).toBe("all");
      expect(r.data.pageSize).toBe(200);
    }
  });
  it("标签颜色必须为 #RRGGBB", () => {
    expect(createTagSchema.safeParse({ name: "工作", color: "#6366F1" }).success).toBe(true);
    expect(createTagSchema.safeParse({ name: "工作", color: "6366F1" }).success).toBe(false);
  });
});

describe("习惯 Schema", () => {
  it("合法创建输入通过", () => {
    const r = createHabitSchema.safeParse({ name: "阅读", color: "#4A7C59", icon: "book-open" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.targetPerWeek).toBe(7);
  });
  it("icon 必须在 24 个内置图标内", () => {
    expect(createHabitSchema.safeParse({ name: "x", color: "#4A7C59", icon: "not-an-icon" }).success).toBe(false);
    for (const icon of HABIT_ICONS) {
      expect(createHabitSchema.safeParse({ name: "x", color: "#4A7C59", icon }).success).toBe(true);
    }
  });
  it("每周目标越界被拒（0 与 8）", () => {
    expect(createHabitSchema.safeParse({ name: "x", color: "#4A7C59", icon: "flame", targetPerWeek: 0 }).success).toBe(false);
    expect(createHabitSchema.safeParse({ name: "x", color: "#4A7C59", icon: "flame", targetPerWeek: 8 }).success).toBe(false);
  });
  it("toggleHabitLogSchema：logDate 必须 YYYY-MM-DD；habitId 必须 cuid", () => {
    expect(toggleHabitLogSchema.safeParse({ habitId: "c0123456789012345678901234", logDate: "2026-10-05" }).success).toBe(true);
    expect(toggleHabitLogSchema.safeParse({ habitId: "c0123456789012345678901234", logDate: "2026/10/05" }).success).toBe(false);
    expect(toggleHabitLogSchema.safeParse({ habitId: "nope", logDate: "2026-10-05" }).success).toBe(false);
  });
});
