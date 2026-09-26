"use client";

import { useState } from "react";
import { useToast } from "@/components/feedback/toast";
import { updatePreferencesAction, updateNotificationAction } from "@/modules/auth/actions/settings-actions";

const COMMON_TIMEZONES = [
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

/** 偏好分区（PRD §7.7）：语言、时区、每周起始日。即时生效，无需保存按钮。 */
export function PreferencesSection({
  timezone,
  weekStartDay,
  locale,
}: {
  timezone: string;
  weekStartDay: number;
  locale: string;
}) {
  const toast = useToast();
  const [tz, setTz] = useState(timezone);
  const [weekStart, setWeekStart] = useState(weekStartDay);
  const [lang, setLang] = useState(locale === "en-US" ? "en-US" : "zh-CN");
  const [busy, setBusy] = useState(false);

  async function persist(next: { timezone: string; weekStartDay: number; locale: string }) {
    setBusy(true);
    const res = await updatePreferencesAction(next);
    setBusy(false);
    if (res.success) {
      toast("success", "偏好已保存");
    } else {
      toast("error", res.error.message);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">语言</span>
        <select
          className="input"
          value={lang}
          disabled={busy}
          onChange={(e) => {
            const locale = e.target.value;
            setLang(locale);
            void persist({ timezone: tz, weekStartDay: weekStart, locale });
          }}
        >
          <option value="zh-CN">简体中文</option>
          <option value="en-US">English</option>
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">时区</span>
        <select
          className="input"
          value={COMMON_TIMEZONES.includes(tz) ? tz : "Asia/Shanghai"}
          disabled={busy}
          onChange={(e) => {
            const timezone = e.target.value;
            setTz(timezone);
            void persist({ timezone, weekStartDay: weekStart, locale: lang });
          }}
        >
          {COMMON_TIMEZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">每周起始日</span>
        <select
          className="input"
          value={String(weekStart)}
          disabled={busy}
          onChange={(e) => {
            const weekStartDay = Number(e.target.value);
            setWeekStart(weekStartDay);
            void persist({ timezone: tz, weekStartDay, locale: lang });
          }}
        >
          <option value="1">周一</option>
          <option value="0">周日</option>
        </select>
      </label>
    </div>
  );
}

/** 通知分区（PRD §7.7）：本期仅存偏好，不实际推送。 */
export function NotificationsSection({
  notifyEmail,
  reminderTime,
}: {
  notifyEmail: boolean;
  reminderTime: string | null;
}) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(notifyEmail);
  const [time, setTime] = useState(reminderTime ?? "09:00");
  const [busy, setBusy] = useState(false);

  async function persist(next: { notifyEmail: boolean; reminderTime: string | null }) {
    setBusy(true);
    const res = await updateNotificationAction(next);
    setBusy(false);
    if (res.success) {
      toast("success", "通知偏好已保存");
    } else {
      toast("error", res.error.message);
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-3">
        <span
          className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
          style={{ backgroundColor: enabled ? "var(--color-primary)" : "var(--color-border)" }}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={enabled}
            disabled={busy}
            onChange={(e) => {
              const notifyEmail = e.target.checked;
              setEnabled(notifyEmail);
              void persist({ notifyEmail, reminderTime: notifyEmail ? time : null });
            }}
          />
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
            style={{ transform: enabled ? "translateX(22px)" : "translateX(2px)" }}
            aria-hidden
          />
        </span>
        <span className="text-sm">每日提醒邮件</span>
      </label>

      {enabled && (
        <div className="pop-in flex items-center gap-3">
          <label className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            提醒时间
          </label>
          <input
            type="time"
            className="input !w-32"
            value={time}
            disabled={busy}
            onChange={(e) => {
              const reminderTime = e.target.value;
              setTime(reminderTime);
              void persist({ notifyEmail: true, reminderTime: reminderTime || null });
            }}
          />
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            （本期仅保存偏好，邮件推送将在后续阶段开放）
          </span>
        </div>
      )}
    </div>
  );
}
