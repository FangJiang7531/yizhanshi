"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ImageIcon, SendHorizonal } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import {
  listConversationsAction,
  listMessagesAction,
  sendImageMessageAction,
  sendTextMessageAction,
} from "../actions/message.actions";
import type { ConversationDTO, MessageDTO } from "../services/message.service";

/**
 * 私聊界面（仿主流社交软件）：
 * - 桌面端：左会话列表 + 右聊天窗格；
 * - 移动端：列表与窗格切换（进入窗格显示返回）；
 * - 支持 文字 + 图片（JPEG/PNG/WebP/GIF，≤5MB，服务端违禁词/规格校验）；
 * - 8s 轮询接收新消息（社交私信对实时性要求低于评论流，轮询够用且更省）。
 */
export function ChatApp() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [activePeer, setActivePeer] = useState<string | null>(searchParams.get("with"));
  const [peerProfile, setPeerProfile] = useState<{ username: string; displayName: string | null; avatarUrl: string | null } | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    const res = await listConversationsAction();
    if (res.success) setConversations(res.data);
  }, []);

  const loadThread = useCallback(async (username: string) => {
    setLoadingThread(true);
    const res = await listMessagesAction({ username, take: 50 });
    setLoadingThread(false);
    if (res.success) {
      setMessages(res.data.items);
      setPeerProfile(res.data.peer);
    } else {
      toast("error", res.error.message);
    }
  }, [toast]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activePeer) void loadThread(activePeer);
  }, [activePeer, loadThread]);

  // 轮询：会话列表 12s / 活跃会话新消息 5s
  useEffect(() => {
    const t1 = window.setInterval(() => void loadConversations(), 12_000);
    const t2 = activePeer
      ? window.setInterval(async () => {
          const res = await listMessagesAction({ username: activePeer, take: 50 });
          if (res.success) setMessages(res.data.items);
        }, 5_000)
      : undefined;
    return () => {
      window.clearInterval(t1);
      if (t2) window.clearInterval(t2);
    };
  }, [activePeer, loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function openPeer(username: string) {
    setActivePeer(username);
    // URL 同步（刷新/分享可还原）
    router.replace(`/messages?with=${encodeURIComponent(username)}`, { scroll: false });
  }

  async function send() {
    const content = draft.trim();
    if (!content || !activePeer || sending) return;
    setSending(true);
    const optimistic: MessageDTO = {
      id: `tmp-${Date.now()}`,
      mine: true,
      content,
      imageUrl: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    const res = await sendTextMessageAction({ username: activePeer, content });
    setSending(false);
    if (res.success) {
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? res.data : m)));
      void loadConversations();
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      toast("error", res.error.message);
    }
  }

  async function sendImage(file: File) {
    if (!activePeer) return;
    setSending(true);
    const res = await sendImageMessageAction({ username: activePeer, file });
    setSending(false);
    if (res.success) {
      setMessages((prev) => [...prev, res.data]);
      void loadConversations();
    } else {
      toast("error", res.error.message);
    }
  }

  const peerDisplay = (c: ConversationDTO) => c.peer.displayName ?? c.peer.username;

  return (
    <div className="card grid h-[calc(100vh-190px)] min-h-[420px] grid-cols-1 overflow-hidden md:grid-cols-[280px_1fr]">
      {/* 会话列表 */}
      <div
        className={`min-h-0 flex-col border-r ${activePeer ? "hidden md:flex" : "flex"}`}
        style={{ borderColor: "color-mix(in srgb, var(--color-border) 40%, transparent)" }}
      >
        <header className="px-4 py-3 text-sm font-semibold">私信</header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
              还没有会话。在文章或评论区点击他人头像即可发起私聊。
            </p>
          ) : (
            <ul>
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => openPeer(c.peer.username)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-bg-elevated)]"
                    style={{
                      backgroundColor: activePeer === c.peer.username ? "color-mix(in srgb, var(--color-primary) 7%, transparent)" : undefined,
                    }}
                  >
                    <Avatar name={peerDisplay(c)} url={c.peer.avatarUrl} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium">{peerDisplay(c)}</span>
                        <span className="shrink-0 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                          {new Date(c.lastMessageAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
                        </span>
                      </span>
                      <span className="block truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {c.lastPreview}
                      </span>
                    </span>
                    {c.unread > 0 && (
                      <span
                        className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                        style={{ backgroundColor: "var(--color-danger)" }}
                      >
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 聊天窗格 */}
      <div className={`min-h-0 flex-col ${activePeer ? "flex" : "hidden md:flex"}`}>
        {activePeer && peerProfile ? (
          <>
            <header
              className="flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid color-mix(in srgb, var(--color-border) 40%, transparent)" }}
            >
              <button type="button" className="icon-btn md:hidden" onClick={() => setActivePeer(null)} aria-label="返回会话列表">
                <ArrowLeft size={17} />
              </button>
              <Avatar name={peerProfile.displayName ?? peerProfile.username} url={peerProfile.avatarUrl} size={30} />
              <span className="text-sm font-medium">{peerProfile.displayName ?? peerProfile.username}</span>
              <span className="ml-auto text-xs" style={{ color: "var(--color-text-muted)" }}>
                @{peerProfile.username}
              </span>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {loadingThread && messages.length === 0 ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className={`skeleton h-10 w-2/3 ${i % 2 ? "" : "ml-auto"}`} />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <p className="py-10 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                  给 TA 发送第一条消息吧
                </p>
              ) : (
                messages.map((m) => <Bubble key={m.id} m={m} />)
              )}
              <div ref={bottomRef} />
            </div>

            <footer
              className="flex items-end gap-2 px-4 py-3"
              style={{ borderTop: "1px solid color-mix(in srgb, var(--color-border) 40%, transparent)" }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void sendImage(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="icon-btn shrink-0"
                aria-label="发送图片"
                title="发送图片（JPEG/PNG/WebP/GIF，≤5MB）"
                disabled={sending}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon size={17} />
              </button>
              <textarea
                className="input max-h-28 min-h-[38px] flex-1 resize-none py-2"
                placeholder="输入消息…（Enter 发送，Shift+Enter 换行）"
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary shrink-0"
                disabled={!draft.trim() || sending}
                onClick={() => void send()}
              >
                <SendHorizonal size={15} aria-hidden />
                发送
              </button>
            </footer>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
            <SendHorizonal size={26} aria-hidden />
            选择一个会话，或在博客里点击用户头像发起私聊
          </div>
        )}
      </div>
    </div>
  );
}

function Bubble({ m }: { m: MessageDTO }) {
  const mine = m.mine;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "rounded-br-sm" : "rounded-bl-sm"}`}
        style={{
          backgroundColor: mine ? "var(--color-primary)" : "color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-elevated))",
          color: mine ? "var(--color-primary-fg)" : "var(--color-text-primary)",
        }}
      >
        {m.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 聊天图片走本地 API，next/image 需额外配置
          <img
            src={m.imageUrl}
            alt="聊天图片"
            className="max-h-64 max-w-full rounded-lg object-contain"
            loading="lazy"
          />
        ) : (
          <p className="whitespace-pre-wrap break-words">{m.content}</p>
        )}
        <p className={`mt-1 text-right text-[10px] ${mine ? "opacity-75" : ""}`} style={{ color: mine ? undefined : "var(--color-text-muted)" }}>
          {new Date(m.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 头像走本地 API 路由
      <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
        color: "var(--color-primary-fg)",
      }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
