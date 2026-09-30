import { notFound, redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { createPostService } from "@/modules/blog/services/post.service";
import { EditorShell } from "@/modules/blog/components/editor/editor-shell";
import { PostNotAccessibleError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const metadata = { title: "编辑文章 · 个人数字工作台" };

/**
 * 编辑器页面（PRD §3.1 路由 /blog/[id]/edit，权限：作者本人）。
 *
 * 渲染策略 force-dynamic：作者视角包含草稿/私密内容，且渲染时刻的数据
 * 必须与乐观锁基线一致（updatedAt 参与冲突检测），不可缓存。
 *
 * `?preview=1`：从「我的文章」列表的"预览"操作进入时直接落在纯预览模式
 * （草稿未发布前公开详情页不可访问，这是作者查看排版的最短路径）。
 */
export default async function EditPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");
  if ("guest" in principal) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;

  let post;
  try {
    const service = createPostService();
    post = await service.getForEdit(principal.user.id, id);
  } catch (err) {
    if (err instanceof PostNotAccessibleError) notFound();
    throw err;
  }

  return <EditorShell post={post} initialPreview={sp.preview === "1"} />;
}
