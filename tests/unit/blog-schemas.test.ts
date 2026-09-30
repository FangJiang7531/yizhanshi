import { describe, expect, it } from "vitest";
import {
  createCommentSchema,
  imageUploadSchema,
  listMineSchema,
  publishPostSchema,
  repostSchema,
  saveDraftSchema,
  searchSchema,
  slugSchema,
  updateSlugSchema,
} from "@/modules/blog/schemas";
import { slugify } from "@/modules/blog/lib/slug";

/**
 * 博客 Zod Schema 单元测试（C-06：服务端校验是唯一可信的校验）。
 * 这些断言是"服务端拒绝非法输入"的第一道防线，与 Action 层的 parse 共用同一批 Schema。
 */
describe("slugSchema", () => {
  it("接受合法 slug", () => {
    for (const ok of ["abc", "post-123", "a1-b2-c3", "x".repeat(80)]) {
      expect(slugSchema.safeParse(ok).success, ok).toBe(true);
    }
  });

  it("拒绝大写、下划线、中文、过短、过长与含空格", () => {
    for (const bad of ["Abc", "a_b", "中文标识", "ab", "x".repeat(81), "a b"]) {
      expect(slugSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("PRD 附录 A 的正则允许首尾连字符，但 slugify 生成时不会产生（首尾已被 trim）", () => {
    // 严格对齐 PRD 给出的 /^[a-z0-9-]{3,80}$/：它不做首尾连字符限制
    expect(slugSchema.safeParse("-abc").success).toBe(true);
    expect(slugSchema.safeParse("abc-").success).toBe(true);
    // 而系统自动生成的 slug 永远不带首尾连字符
    expect(slugify("-abc-")).toBe("abc");
    expect(slugify("Hello World!")).toBe("hello-world");
  });

  it("自动 trim 首尾空白", () => {
    const res = slugSchema.safeParse("  abc  ");
    expect(res.success).toBe(true);
    expect(res.success && res.data).toBe("abc");
  });
});

describe("saveDraftSchema（草稿态宽松）", () => {
  it("空标题空正文也能保存（写到一半就该能存）", () => {
    const res = saveDraftSchema.safeParse({});
    expect(res.success).toBe(true);
    expect(res.success && res.data.title).toBe("");
    expect(res.success && res.data.contentMd).toBe("");
  });

  it("默认可见性 PUBLIC、允许评论与转发", () => {
    const res = saveDraftSchema.parse({});
    expect(res.visibility).toBe("PUBLIC");
    expect(res.allowComment).toBe(true);
    expect(res.allowRepost).toBe(true);
    expect(res.tagNames).toEqual([]);
  });

  it("标题超 120 字被拒", () => {
    expect(saveDraftSchema.safeParse({ title: "字".repeat(121) }).success).toBe(false);
  });

  it("正文超 20 万字被拒", () => {
    expect(saveDraftSchema.safeParse({ contentMd: "字".repeat(200_001) }).success).toBe(false);
  });

  it("标签最多 8 个，单个最多 30 字", () => {
    expect(saveDraftSchema.safeParse({ tagNames: Array.from({ length: 9 }, (_, i) => `t${i}`) }).success).toBe(false);
    expect(saveDraftSchema.safeParse({ tagNames: ["x".repeat(31)] }).success).toBe(false);
    expect(saveDraftSchema.safeParse({ tagNames: ["效率", "方法论"] }).success).toBe(true);
  });

  it("拒绝非法可见性枚举", () => {
    expect(saveDraftSchema.safeParse({ visibility: "EVERYONE" }).success).toBe(false);
    expect(saveDraftSchema.safeParse({ visibility: "UNLISTED" }).success).toBe(true);
  });
});

describe("publishPostSchema（发布态严格）", () => {
  const base = { id: "ckzzzzzzzzzzzzzzzzzzzzzzzz" };

  it("标题与正文必填", () => {
    expect(publishPostSchema.safeParse(base).success).toBe(false);
    expect(publishPostSchema.safeParse({ ...base, title: "", contentMd: "正文" }).success).toBe(false);
    expect(publishPostSchema.safeParse({ ...base, title: "标题", contentMd: "" }).success).toBe(false);
    expect(publishPostSchema.safeParse({ ...base, title: "标题", contentMd: "正文" }).success).toBe(true);
  });

  it("id 必须是 cuid", () => {
    expect(publishPostSchema.safeParse({ id: "not-a-cuid", title: "标题", contentMd: "正文" }).success).toBe(false);
  });

  it("slug 可选，提供时必须是合法格式", () => {
    expect(publishPostSchema.safeParse({ ...base, title: "t", contentMd: "c" }).success).toBe(true);
    expect(publishPostSchema.safeParse({ ...base, title: "t", contentMd: "c", slug: "valid-slug" }).success).toBe(true);
    expect(publishPostSchema.safeParse({ ...base, title: "t", contentMd: "c", slug: "Invalid_Slug" }).success).toBe(false);
  });

  it("SEO 字段长度限制：标题 60 / 描述 160", () => {
    const ok = publishPostSchema.safeParse({
      ...base,
      title: "t",
      contentMd: "c",
      seoTitle: "s".repeat(60),
      seoDesc: "d".repeat(160),
    });
    expect(ok.success).toBe(true);

    expect(publishPostSchema.safeParse({ ...base, title: "t", contentMd: "c", seoTitle: "s".repeat(61) }).success).toBe(
      false,
    );
    expect(publishPostSchema.safeParse({ ...base, title: "t", contentMd: "c", seoDesc: "d".repeat(161) }).success).toBe(
      false,
    );
  });
});

describe("updateSlugSchema", () => {
  it("id 与 slug 都必填", () => {
    expect(updateSlugSchema.safeParse({ id: "ckzzzzzzzzzzzzzzzzzzzzzzzz", slug: "ok-slug" }).success).toBe(true);
    expect(updateSlugSchema.safeParse({ id: "ckzzzzzzzzzzzzzzzzzzzzzzzz" }).success).toBe(false);
  });
});

describe("createCommentSchema", () => {
  it("内容 1–2000 字，自动 trim", () => {
    expect(createCommentSchema.parse({ postId: "ckzzzzzzzzzzzzzzzzzzzzzzzz", content: "  hi  " }).content).toBe("hi");
    expect(createCommentSchema.safeParse({ postId: "ckzzzzzzzzzzzzzzzzzzzzzzzz", content: "   " }).success).toBe(false);
    expect(
      createCommentSchema.safeParse({ postId: "ckzzzzzzzzzzzzzzzzzzzzzzzz", content: "字".repeat(2001) }).success,
    ).toBe(false);
  });

  it("parentId 可选但必须是 cuid", () => {
    expect(
      createCommentSchema.safeParse({ postId: "ckzzzzzzzzzzzzzzzzzzzzzzzz", content: "x", parentId: "nope" }).success,
    ).toBe(false);
  });
});

describe("repostSchema", () => {
  it("转发语最多 200 字，可为空", () => {
    const postId = "ckzzzzzzzzzzzzzzzzzzzzzzzz";
    expect(repostSchema.parse({ postId, comment: "" }).comment).toBe("");
    expect(repostSchema.parse({ postId }).comment).toBeUndefined();
    expect(repostSchema.safeParse({ postId, comment: "字".repeat(201) }).success).toBe(false);
  });
});

describe("imageUploadSchema（C-07 不信任前端）", () => {
  it("只接受白名单 MIME", () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      expect(imageUploadSchema.safeParse({ size: 1000, mime }).success, mime).toBe(true);
    }
    for (const mime of ["image/svg+xml", "text/html", "application/pdf", "image/bmp"]) {
      expect(imageUploadSchema.safeParse({ size: 1000, mime }).success, mime).toBe(false);
    }
  });

  it("size 必须为正整数且不超过上界", () => {
    expect(imageUploadSchema.safeParse({ size: 0, mime: "image/png" }).success).toBe(false);
    expect(imageUploadSchema.safeParse({ size: -1, mime: "image/png" }).success).toBe(false);
    expect(imageUploadSchema.safeParse({ size: 1.5, mime: "image/png" }).success).toBe(false);
    expect(imageUploadSchema.safeParse({ size: 21 * 1024 * 1024, mime: "image/png" }).success).toBe(false);
  });
});

describe("searchSchema / listMineSchema", () => {
  it("搜索至少 2 字符", () => {
    expect(searchSchema.safeParse({ q: "打" }).success).toBe(false);
    expect(searchSchema.parse({ q: "打卡" }).q).toBe("打卡");
    expect(searchSchema.parse({ q: "打卡" }).take).toBe(20);
  });

  it("我的文章列表的 take 有上界（防止一次拉爆）", () => {
    expect(listMineSchema.safeParse({ take: 999 }).success).toBe(false);
    expect(listMineSchema.parse({}).take).toBe(20);
    expect(listMineSchema.parse({ take: "10" }).take).toBe(10); // coerce
  });
});
