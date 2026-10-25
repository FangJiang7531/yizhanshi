"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { getActiveAnnouncementAction, type ActiveAnnouncementDTO } from "@/modules/notification/actions/system.actions";

/**
 * 弹窗公告：进入平台时拉取当前生效公告；每条公告对每用户只弹一次
 * （localStorage 记忆已读）。级别影响配色：info 蓝 / warning 橙 / critical 红。
 */
const LEVEL_STYLE: Record<ActiveAnnouncementDTO["level"], { bar: string; title: string }> = {
  info: { bar: "var(--color-info)", title: "var(--color-info)" },
  warning: { bar: "var(--color-warning)", title: "var(--color-warning)" },
  critical: { bar: "var(--color-danger)", title: "var(--color-danger)" },
};

export function AnnouncementPopup({ isGuest }: { isGuest: boolean }) {
  const [announcement, setAnnouncement] = useState<ActiveAnnouncementDTO | null>(null);

  useEffect(() => {
    if (isGuest) return; // 公告面向登录用户
    let alive = true;
    void (async () => {
      const res = await getActiveAnnouncementAction();
      if (!alive || !res.success || !res.data) return;
      // 每条公告仅弹一次
      try {
        const seen = window.localStorage.getItem(`pwb-ann-${res.data.id}`) === "1";
        if (seen) return;
      } catch {
        // ignore
      }
      setAnnouncement(res.data);
    })();
    return () => {
      alive = false;
    };
  }, [isGuest]);

  if (!announcement) return null;
  const style = LEVEL_STYLE[announcement.level] ?? LEVEL_STYLE.info;

  function close() {
    if (announcement) {
      try {
        window.localStorage.setItem(`pwb-ann-${announcement.id}`, "1");
      } catch {
        // ignore
      }
    }
    setAnnouncement(null);
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      role="dialog"
      aria-label="站内公告"
    >
      <div className="card pop-in w-full max-w-md overflow-hidden" style={{ boxShadow: "var(--shadow-lg)" }}>
        <div className="h-1.5" style={{ backgroundColor: style.bar }} aria-hidden />
        <div className="p-5">
          <header className="mb-2 flex items-center gap-2">
            <Bell size={16} style={{ color: style.title }} aria-hidden />
            <h2 className="flex-1 text-sm font-semibold" style={{ color: style.title }}>
              {announcement.title}
            </h2>
            <button type="button" className="icon-btn !h-7 !w-7" onClick={close} aria-label="关闭公告">
              <X size={14} />
            </button>
          </header>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
            {announcement.content}
          </p>
          <div className="mt-4 flex justify-end">
            <button type="button" className="btn btn-primary btn-sm" onClick={close}>
              我知道了
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
