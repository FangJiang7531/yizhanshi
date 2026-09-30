import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { NewPostRedirect } from "@/modules/blog/components/editor/new-post-redirect";

export const dynamic = "force-dynamic";

export const metadata = { title: "新建文章 · 个人数字工作台" };

/**
 * 新建文章（PRD §3.1 路由 /blog/new）。
 *
 * 创建动作必须发生在**客户端首屏之后**：草稿创建是写操作，
 * 放在服务端渲染里会在每次预取/刷新时都造出一篇空草稿。
 * 这里渲染一个轻量跳板组件，挂载后创建草稿并 replace 进编辑器。
 */
export default async function NewPostPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");
  if ("guest" in principal) redirect("/login");

  return <NewPostRedirect />;
}
