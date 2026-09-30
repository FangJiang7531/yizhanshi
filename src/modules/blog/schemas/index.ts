import { z } from "zod";
import { SLUG_REGEX } from "../lib/slug";

/**
 * 博客模块 Zod Schema（PRD 附录 A + 制作流程 Step 4.1）。
 *
 * 原则：所有写入 Action 一律 `schema.parse(input)`（服务端校验，C-06），
 * 前端校验只是体验优化，绝不被信任。
 */

/** 链接标识：仅小写字母、数字与连字符（SLUG_REGEX 唯一真源在 lib/slug.ts） */
export const slugSchema = z
  .string()
  .trim()
  .regex(SLUG_REGEX, "链接标识仅允许小写字母、数字与连字符，长度 3–80");

export const postVisibilitySchema = z.enum(["PUBLIC", "UNLISTED", "PRIVATE"]);

const tagNameSchema = z.string().trim().min(1, "标签名不能为空").max(30, "标签最多 30 字");

/** 可选的 URL/路径字符串：允许空串（前端表单默认值） */
const optionalUrl = z.string().trim().max(500).optional().or(z.literal(""));

/**
 * 草稿保存（自动保存 / 手动保存共用）。
 * 草稿态刻意宽松：标题与正文都允许为空（写到一半就该能存），
 * 严格校验只在**发布**时执行（PRD §5.3 步骤①②）。
 */
export const saveDraftSchema = z.object({
  /** 无 id = 新建 */
  id: z.string().cuid().optional(),
  title: z.string().trim().max(120, "标题最多 120 字").default(""),
  excerpt: z.string().trim().max(300, "摘要最多 300 字").optional().or(z.literal("")),
  contentMd: z.string().max(200_000, "正文最多 20 万字").default(""),
  coverImage: optionalUrl,
  tagNames: z.array(tagNameSchema).max(8, "最多 8 个标签").default([]),
  visibility: postVisibilitySchema.default("PUBLIC"),
  allowComment: z.boolean().default(true),
  allowRepost: z.boolean().default(true),
  seoTitle: z.string().trim().max(60, "SEO 标题最多 60 字").optional().or(z.literal("")),
  seoDesc: z.string().trim().max(160, "SEO 描述最多 160 字").optional().or(z.literal("")),
  ogImage: optionalUrl,
  /**
   * 乐观锁基线：客户端加载时拿到的 updatedAt（ISO 串）。
   * 不匹配 → 说明另一标签页已改过，返回冲突而不静默覆盖（A-04）。
   */
  baseUpdatedAt: z.string().optional(),
});

/**
 * 发布（严格版）。除保存所需字段外：
 * - 标题、正文必填；
 * - slug 可选（不传则服务端按标题生成并去重）；
 * - 封面图必须是站内路径或 https URL。
 */
export const publishPostSchema = z.object({
  id: z.string().cuid(),
  title: z.string().trim().min(1, "请输入标题").max(120, "标题最多 120 字"),
  excerpt: z.string().trim().max(300, "摘要最多 300 字").optional().or(z.literal("")),
  contentMd: z.string().min(1, "正文不能为空").max(200_000, "正文最多 20 万字"),
  coverImage: optionalUrl,
  tagNames: z.array(tagNameSchema).max(8, "最多 8 个标签").default([]),
  visibility: postVisibilitySchema.default("PUBLIC"),
  allowComment: z.boolean().default(true),
  allowRepost: z.boolean().default(true),
  seoTitle: z.string().trim().max(60, "SEO 标题最多 60 字").optional().or(z.literal("")),
  seoDesc: z.string().trim().max(160, "SEO 描述最多 160 字").optional().or(z.literal("")),
  ogImage: optionalUrl,
  slug: slugSchema.optional(),
  baseUpdatedAt: z.string().optional(),
});

/** 显式"更新链接标识"（改标题不自动改 slug；此操作单独确认，B-03/Step 3.2 判据 3） */
export const updateSlugSchema = z.object({
  id: z.string().cuid(),
  slug: slugSchema,
});

export const archivePostSchema = z.object({ id: z.string().cuid() });
export const deletePostSchema = z.object({ id: z.string().cuid() });

export const listMineSchema = z.object({
  status: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["updated", "published", "views"]).default("updated"),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(20),
});

export const publicListSchema = z.object({
  tab: z.enum(["latest", "hot"]).default("latest"),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(12),
});

export const createCommentSchema = z.object({
  postId: z.string().cuid(),
  parentId: z.string().cuid().optional(),
  content: z.string().trim().min(1, "评论不能为空").max(2000, "评论最多 2000 字"),
});

export const deleteCommentSchema = z.object({ id: z.string().cuid() });

export const repostSchema = z.object({
  postId: z.string().cuid(),
  comment: z.string().trim().max(200, "转发语最多 200 字").optional().or(z.literal("")),
});

export const toggleLikeSchema = z.object({ postId: z.string().cuid() });

export const toggleCommentLikeSchema = z.object({ commentId: z.string().cuid() });

export const recordViewSchema = z.object({ postId: z.string().cuid() });

export const shareSchema = z.object({ postId: z.string().cuid() });

export const searchSchema = z.object({
  q: z.string().trim().min(2, "至少输入 2 个字符").max(100, "关键词最多 100 字"),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(20),
});

export const authorPageSchema = z.object({
  username: z.string().trim().min(1).max(50),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(10),
});

export const tagArchiveSchema = z.object({
  tag: z.string().trim().min(1).max(50),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * 公开列表"加载更多"（发现页 / 作者页 / 标签页共用）。
 *
 * 为什么用 Server Action 而不是分页链接里的 `?cursor=`：
 * 详情页与作者页/标签页是 **ISR 静态页**，一旦读取 `searchParams`，Next 会把整条
 * 路由拉回动态渲染，ISR 直接失效。改用客户端加载更多 → 首屏保持静态可缓存，
 * 追加数据走按需请求，两边都不牺牲。
 */
export const loadMorePostsSchema = z
  .object({
    scope: z.enum(["all", "tag", "author"]),
    tab: z.enum(["latest", "hot"]).optional(),
    tag: z.string().trim().min(1).max(50).optional(),
    username: z.string().trim().min(1).max(50).optional(),
    cursor: z.string().optional(),
    take: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine((v) => v.scope !== "tag" || Boolean(v.tag), {
    message: "scope=tag 时必须提供 tag",
    path: ["tag"],
  })
  .refine((v) => v.scope !== "author" || Boolean(v.username), {
    message: "scope=author 时必须提供 username",
    path: ["username"],
  });

/** 审核队列（ADMIN） */
export const moderateSchema = z.object({
  id: z.string().cuid(),
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(300, "审核意见最多 300 字").optional().or(z.literal("")),
});

/**
 * 图片上传（制作流程 Step 4.2）。
 * size 上限默认 5MB，可由环境变量 BLOG_IMAGE_MAX_SIZE_MB 覆盖（此处用宽松上界，精确值在 Action 内校验）。
 */
export const imageUploadSchema = z.object({
  size: z.number().int().positive().max(20 * 1024 * 1024, "单张图片过大"),
  mime: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"], {
    message: "仅支持 JPEG / PNG / WebP / GIF",
  }),
});

/**
 * 数据卡片生成（编辑器"插入数据卡片"，PRD A-20）。
 * 习惯卡选具体习惯；任务卡为整体清单进度（无附加参数）。
 */
export const buildDataCardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("habit"), habitId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("task") }),
]);

/** 编辑器预览渲染请求体（Route Handler /api/blog/render-preview） */
export const renderPreviewSchema = z.object({
  contentMd: z.string().max(200_000, "正文最多 20 万字"),
});

/**
 * 导出给服务层的入参类型一律用 `z.input`（**解析前**的形态）而非 `z.infer`。
 *
 * 原因：带 `.default()` 的字段在 `z.infer`（即输出类型）里会变成必填，
 * 但服务层实际接收的是"调用方还没补齐默认值"的原始对象，
 * 由服务层内部 `schema.parse()` 补全。用 `z.infer` 会强迫每个调用点手写全部默认值，
 * 既啰嗦又容易与 Schema 默认值不一致。
 */
export type SaveDraftInput = z.input<typeof saveDraftSchema>;
export type PublishPostInput = z.input<typeof publishPostSchema>;
export type UpdateSlugInput = z.input<typeof updateSlugSchema>;
export type ListMineInput = z.input<typeof listMineSchema>;
export type PublicListInput = z.input<typeof publicListSchema>;
export type LoadMorePostsInput = z.input<typeof loadMorePostsSchema>;
export type CreateCommentInput = z.input<typeof createCommentSchema>;
export type RepostInput = z.input<typeof repostSchema>;
export type SearchInput = z.input<typeof searchSchema>;
export type ModerateInput = z.input<typeof moderateSchema>;
export type ImageUploadInput = z.input<typeof imageUploadSchema>;
export type BuildDataCardInput = z.input<typeof buildDataCardSchema>;

/** 解析后的形态（需要显式使用"已补全默认值"的类型时用这个） */
export type SaveDraftParsed = z.infer<typeof saveDraftSchema>;
export type PublishPostParsed = z.infer<typeof publishPostSchema>;
export type CreateCommentParsed = z.infer<typeof createCommentSchema>;
