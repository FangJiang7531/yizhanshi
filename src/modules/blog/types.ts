import type { AuditStatus, CommentStatus, PostStatus, PostVisibility } from "@prisma/client";

/**
 * 博客模块类型定义（DTO 与查询入参）。
 *
 * DTO 一律是「可跨 RSC 边界序列化」的纯数据结构（日期 → ISO 字符串），
 * 因为 SSG 页面是服务端组件、互动组件是客户端组件，二者共享同一份类型。
 */

// ───────────────────────────── 查询入参 ─────────────────────────────

export type ListMineQuery = {
  status?: PostStatus;
  q?: string;
  /** updated=最近更新 / published=最近发布 / views=阅读量 */
  sort?: "updated" | "published" | "views";
  cursor?: string;
  take: number;
};

export type PublicListQuery = {
  /** latest = 发布时间倒序；hot = 热度（点赞 > 浏览）倒序 */
  tab?: "latest" | "hot";
  cursor?: string;
  take: number;
};

// ───────────────────────────── 基础 DTO ─────────────────────────────

export type TagRefDTO = { id: string; name: string; color: string };

export type AuthorDTO = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

/** 列表项：不含正文（列表页不需要，避免把大字段传过 RSC 边界） */
export type PostListItemDTO = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  status: PostStatus;
  visibility: PostVisibility;
  auditStatus: AuditStatus;
  publishedAt: string | null;
  updatedAt: string;
  wordCount: number;
  readingMinutes: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  shareCount: number;
  allowComment: boolean;
  allowRepost: boolean;
  tags: TagRefDTO[];
  author: AuthorDTO;
};

/** 详情：公开视角（含预渲染 HTML，不含 Markdown 原文；私密/草稿走作者视角） */
export type PostDetailDTO = PostListItemDTO & {
  contentHtml: string;
  /** 目录（h2/h3）；发布时随 HTML 一并固化，详情页直接读取而无需重新解析 Markdown */
  toc: TocItemDTO[];
  auditNote: string | null;
  seoTitle: string | null;
  seoDesc: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
};

/** 目录项（与 lib/markdown 的 TocItem 同构，此处复述一遍以保持 types.ts 零依赖） */
export type TocItemDTO = { depth: number; text: string; id: string };

/** 编辑视角：额外给出 Markdown 原文与 slug（编辑器与"更新链接标识"用） */
export type PostEditDTO = PostDetailDTO & {
  contentMd: string;
};

/** 详情页返回：附带视角判定，供页面决定是否显示编辑入口 / noindex */
export type PostViewResult = {
  post: PostDetailDTO | PostEditDTO;
  isAuthor: boolean;
  canEdit: boolean;
  /** 是否走作者视角（含未发布文章） */
  isAuthorView: boolean;
};

/** /blog/me 页头统计 */
export type MineStatsDTO = {
  draft: number;
  review: number;
  published: number;
  archived: number;
  totalViews: number;
};

/** 评论 DTO（两级：顶层含 replies，回复不再有 replies —— 深度恒 ≤2） */
export type CommentDTO = {
  id: string;
  /** 所属顶层评论 id；null = 顶层（SSE 增量流的归属判定依赖此字段） */
  parentId: string | null;
  content: string;
  /** 轻量 Markdown 渲染后的安全 HTML */
  contentHtml: string;
  status: CommentStatus;
  /** 软删除占位：true 时 content/contentHtml 已抹为占位文案 */
  deleted: boolean;
  createdAt: string;
  likeCount: number;
  author: AuthorDTO;
  /** 当前查看者是否可删除（本人或管理员） */
  canDelete: boolean;
  /** 当前查看者是否已点赞 */
  liked: boolean;
  replies: CommentDTO[];
};

export type CommentListDTO = {
  items: CommentDTO[];
  total: number;
  nextCursor: string | null;
};

/** 待审评论（审核队列行：轻量字段 + 所属文章定位） */
export type PendingCommentDTO = {
  id: string;
  content: string;
  createdAt: string;
  author: AuthorDTO;
  post: { id: string; slug: string; title: string };
};

/** 搜索结果项 */
export type SearchHitDTO = {
  id: string;
  slug: string;
  title: string;
  /** 标题（已转义，命中词含 <mark> 高亮；PRD A-14） */
  titleHtml: string;
  excerpt: string | null;
  author: AuthorDTO;
  publishedAt: string | null;
  readingMinutes: number;
  tags: TagRefDTO[];
  /** 命中片段（含 <mark> 高亮），无命中片段时为 null */
  snippetHtml: string | null;
};

export type SearchResultDTO = {
  q: string;
  items: SearchHitDTO[];
  nextCursor: string | null;
};

/** 标签云项 */
export type TagCloudItemDTO = {
  id: string;
  name: string;
  color: string;
  postCount: number;
};
