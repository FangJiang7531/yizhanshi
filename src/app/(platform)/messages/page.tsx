import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { ChatApp } from "@/modules/notification/components/chat-app";

export const dynamic = "force-dynamic";

/** 私信主页：会话列表 + 聊天窗格（仿社交软件布局） */
export default async function MessagesPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");
  if ("guest" in principal) {
    return (
      <div className="card mx-auto mt-16 max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">私信</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          访客模式下私信不可用，注册账号即可与其他用户私聊。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">私信</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          与其他用户一对一交流，支持文字与图片。
        </p>
      </header>
      <ChatApp />
    </div>
  );
}
