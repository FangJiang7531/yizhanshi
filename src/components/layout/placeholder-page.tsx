import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { COMING_SOON_MODULE, MODULES } from "@/config/modules";
import { ComingSoonPage } from "@/components/feedback/coming-soon";

/**
 * 占位页统一入口：依据当前请求路径从模块注册表取元信息，
 * 再交 `ComingSoonPage` 渲染。
 *
 * 这样 7 个预留板块各自只需一个 3 行 page.tsx，新增板块时
 * 唯一要改的仍是 `src/config/modules.ts`（假设 H1）。
 */
export async function PlaceholderPage() {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? h.get("x-invoke-path") ?? "";
  const mod =
    MODULES.find((m) => pathname === m.path || pathname.startsWith(`${m.path}/`)) ??
    (pathname === COMING_SOON_MODULE.path ? COMING_SOON_MODULE : undefined);

  if (!mod) {
    // 已就绪板块误用占位页组件：交回路由处理
    notFound();
  }

  if (mod.status === "ready") {
    redirect(mod.path);
  }

  // 图标在服务端渲染为 ReactNode 传入：组件函数无法跨服务端/客户端边界序列化
  const Icon = mod.icon;
  return (
    <ComingSoonPage
      name={mod.name}
      icon={<Icon size={38} />}
      description={mod.description}
      status={mod.status}
    />
  );
}
