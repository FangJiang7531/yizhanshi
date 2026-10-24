"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, CheckCheck, Heart, MessageSquare, MessageCircle, Reply, UserPlus, Settings } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import {
  getBadgeAction,
  listNotificationsAction,
  markAllReadAction,
  markReadAction,
  type NotificationItemDTO,
} from "../actions/notification.actions";

/**
 * 通知铃铛 + 下拉面板。
 * - 角标：红点数字，超过 99 显示 99+；轮询 60s + 窗口聚焦时立即刷新；
 * - 面板：最近 20 条通知，点击跳转（评论类通知带 #comment-xx 锚点，
 *   文章页监听该锚点并高亮对应评论 1 秒）。
 */

const TYPE_ICON: Record<NotificationItemDTO["type"], typeof Heart> = {
  POST_LIKE: Heart,
  POST_COMMENT: MessageSquare,
  COMMENT_REPLY: Reply,
  FOLLOW: UserPlus,
  MESSAGE: MessageCircle,
  SYSTEM: Settings,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

export function NotificationBell({ isGuest }: { isGuest: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItemDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const [msgUnread, setMsgUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshBadge = useCallback(async () => {
    const res = await getBadgeAction();
    if (res.success) {
      setUnread(res.data.notifications);
      setMsgUnread(res.data.messages);
    }
  }, []);

  // 轮询 + 聚焦刷新
  useEffect(() => {
    if (isGuest) return;
    void refreshBadge();
    const timer = window.setInterval(() => void refreshBadge(), 60_000);
    const onFocus = () => void refreshBadge();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [isGuest, refreshBadge]);

  // 点外关面板
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function loadList() {
    setLoading(true);
    const res = await listNotificationsAction({ take: 20 });
    setLoading(false);
    if (res.success) {
      setNotifications(res.data.items);
    } else {
      toast("error", res.error.message);
    }
  }

  function togglePanel() {
    if (isGuest) {
      toast.info("访客模式下通知不可用，注册后解锁");
      return;
    }
    const next = !open;
    setOpen(next);
    if (next) void loadList();
  }

  async function handleItemClick(n: NotificationItemDTO) {
    if (!n.read) {
      // 乐观置已读
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      await markReadAction({ ids: [n.id] });
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function handleMarkAll() {
    const res = await markAllReadAction({});
    if (res.success) {
      setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
      setUnread(0);
      toast("success", `已将 ${res.data.marked} 条通知标为已读`);
    } else {
      toast("error", res.error.message);
    }
  }

  const badge = unread + msgUnread;

  return (
    <div className="relative" ref={rootRef}>
      <button type="button" className="icon-btn relative" aria-label="通知" title="通知中心" onClick={togglePanel}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {badge > 0 && (
          <span
            className="pop-in absolute -right-0.5 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
            style={{ backgroundColor: "var(--color-danger)", color: "#fff" }}
            aria-label={`${badge} 条未读`}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>

      {open && (
        <div
          className="card pop-in absolute right-0 top-[calc(100%+8px)] z-50 flex max-h-[70vh] w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden"
          style={{ boxShadow: "var(--shadow-lg)" }}
          role="dialog"
          aria-label="通知中心"
        >
          <header className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold">通知中心</h2>
            <div className="flex items-center gap-2">
              <Link
                href="/messages"
                className="flex items-center gap-1 text-xs transition-colors hover:underline"
                style={{ color: msgUnread > 0 ? "var(--color-danger)" : "var(--color-primary)" }}
                onClick={() => setOpen(false)}
              >
                <MessageCircle size={13} aria-hidden />
                私信{msgUnread > 0 ? `（${msgUnread > 99 ? "99+" : msgUnread}）` : ""}
              </Link>
              {unread > 0 && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs transition-colors hover:underline"
                  style={{ color: "var(--color-text-muted)" }}
                  onClick={() => void handleMarkAll()}
                >
                  <CheckCheck size={13} aria-hidden />
                  全部已读
                </button>
              )}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-12" />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm" style={{ color: "var(--color-text-muted)" }}>
                <Bell size={22} aria-hidden />
                暂无通知
              </div>
            ) : (
              <ul>
                {notifications.map((n) => {
                  const Icon = TYPE_ICON[n.type] ?? Bell;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void handleItemClick(n)}
                        className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-bg-elevated)]"
                        style={{
                          backgroundColor: n.read ? "transparent" : "color-mix(in srgb, var(--color-primary) 6%, transparent)",
                        }}
                      >
                        <span
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                          style={{
                            backgroundColor: "color-mix(in srgb, var(--color-primary) 10%, transparent)",
                            color: "var(--color-primary)",
                          }}
                          aria-hidden
                        >
                          <Icon size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{n.title}</span>
                          {n.content ? (
                            <span className="block truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
                              {n.content}
                            </span>
                          ) : null}
                          <span className="mt-0.5 block text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                            {timeAgo(n.createdAt)}
                          </span>
                        </span>
                        {!n.read && (
                          <span
                            className="mt-2 h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: "var(--color-danger)" }}
                            aria-label="未读"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
