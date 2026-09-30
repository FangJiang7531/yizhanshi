import type { BlogPost, Comment } from "@prisma/client";
import type {
  AuthorDTO,
  CommentDTO,
  PostDetailDTO,
  PostEditDTO,
  PostListItemDTO,
  SearchHitDTO,
  TagCloudItemDTO,
  TagRefDTO,
} from "../types";

/**
 * DTO 序列化（服务端实体 → 可跨 RSC 边界的纯数据）。
 *
 * 为什么单独成文件：SSG 页面（服务端组件）与互动组件（客户端组件）共享同一份 DTO 类型，
 * 把 Date 统一转成 ISO 串、把 Prisma 的嵌套 shape 拍平成前端好用的结构，避免两边各写一份。
 */

type AuthorShape = { id: string; username: string; displayName: string | null; avatarUrl: string | null };

type PostWithRelations = BlogPost & {
  user: AuthorShape;
  tags: { tag: { id: string; name: string; color: string } }[];
};

type CommentWithAuthor = Comment & { user: AuthorShape };

function toAuthor(user: AuthorShape): AuthorDTO {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

function toTags(tags: { tag: { id: string; name: string; color: string } }[]): TagRefDTO[] {
  return tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color }));
}

/** 列表项：不含正文，减少过 RSC 边界的数据量 */
export function serializePostListItem(post: PostWithRelations): PostListItemDTO {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    coverImage: post.coverImage,
    status: post.status,
    visibility: post.visibility,
    auditStatus: post.auditStatus,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    updatedAt: post.updatedAt.toISOString(),
    wordCount: post.wordCount,
    readingMinutes: post.readingMinutes,
    viewCount: post.viewCount,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    repostCount: post.repostCount,
    shareCount: post.shareCount,
    allowComment: post.allowComment,
    allowRepost: post.allowRepost,
    tags: toTags(post.tags),
    author: toAuthor(post.user),
  };
}

/** 公开详情（含预渲染 HTML；不含 Markdown 原文，避免把"可编辑源"送到公开页） */
export function serializePostDetail(post: PostWithRelations): PostDetailDTO {
  return {
    ...serializePostListItem(post),
    contentHtml: post.contentHtml ?? "",
    auditNote: post.auditNote,
    seoTitle: post.seoTitle,
    seoDesc: post.seoDesc,
    ogImage: post.ogImage,
    canonicalUrl: post.canonicalUrl,
  };
}

/** 编辑视角（作者本人）：额外给出 Markdown 原文（编辑器需要） */
export function serializePostForEdit(post: PostWithRelations): PostEditDTO {
  return { ...serializePostDetail(post), contentMd: post.contentMd };
}

/** 评论：已删除的评论保留占位（content 抹去，保留楼层） */
export function serializeComment(
  comment: CommentWithAuthor,
  opts: { viewerId: string | null; viewerIsAdmin: boolean; liked: boolean; contentHtml: string },
): CommentDTO {
  const deleted = comment.deletedAt !== null;
  const isOwn = opts.viewerId !== null && opts.viewerId === comment.userId;
  return {
    id: comment.id,
    content: deleted ? "" : comment.content,
    contentHtml: deleted ? "" : opts.contentHtml,
    status: comment.status,
    deleted,
    createdAt: comment.createdAt.toISOString(),
    likeCount: comment.likeCount,
    author: toAuthor(comment.user),
    canDelete: !deleted && (isOwn || opts.viewerIsAdmin),
    liked: opts.liked,
    replies: [],
  };
}

export function serializeSearchHit(post: PostWithRelations, snippetHtml: string | null): SearchHitDTO {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    author: toAuthor(post.user),
    publishedAt: post.publishedAt?.toISOString() ?? null,
    readingMinutes: post.readingMinutes,
    tags: toTags(post.tags),
    snippetHtml,
  };
}

export function serializeTagCloud(
  rows: { id: string; name: string; color: string; _count: { postLinks: number } }[],
): TagCloudItemDTO[] {
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color, postCount: r._count.postLinks }));
}

export type { PostWithRelations, CommentWithAuthor, AuthorShape };
