import { redirect } from "next/navigation";

/**
 * 「我的文章」已升级为「我的空间」（2026-10）：
 * 旧入口永久跳转，外链/收藏不断链。
 */
export default async function BlogMeRedirect() {
  redirect("/space");
}
