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

  return (
    <ComingSoonPage
      name={mod.name}
      icon={mod.icon}
      description={mod.description}
      status={mod.status}
    />
  );
}
