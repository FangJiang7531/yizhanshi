"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import { adminSetFlagAction } from "../actions/admin.actions";

type Mod = { key: string; name: string; status: string };
type Flag = { key: string; enabled: boolean; disabledReason: string | null };

/** 功能开关面板：短链/书签等已上线板块可即时启停 */
export function AdminFeatures({ modules, initialFlags }: { modules: Mod[]; initialFlags: Flag[] }) {
  const toast = useToast();
  const [flags, setFlags] = useState<Record<string, Flag>>(
    Object.fromEntries(initialFlags.map((f) => [f.key, f])),
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // 可管控的板块（已上线功能；预留板块本身未开放无需开关）
  const controllable = ["links", "bookmarks", "messages", "blog"];
  const rows = modules.filter((m) => controllable.includes(m.key));

  async function toggle(key: string, enabled: boolean) {
    setBusyKey(key);
    const res = await adminSetFlagAction({ key, enabled });
    setBusyKey(null);
    if (res.success) {
      setFlags((prev) => ({ ...prev, [key]: { key, enabled, disabledReason: enabled ? null : "功能维护中" } }));
      toast("success", enabled ? `已启用「${key}」` : `已停用「${key}」`);
    } else {
      toast("error", res.error.message);
    }
  }

  const card = { backgroundColor: "rgba(22,30,66,0.7)", border: "1px solid rgba(125,140,255,0.14)" } as const;

  return (
    <ul className="space-y-2">
      {rows.map((m) => {
        const flag = flags[m.key];
        const enabled = flag?.enabled ?? true;
        return (
          <li key={m.key} className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] p-4" style={card}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: "#dfe4ff" }}>{m.name} <span className="text-[11px] font-normal" style={{ color: "#5f6a96" }}>{m.key}</span></p>
              <p className="text-[11px]" style={{ color: enabled ? "#4ade80" : "#ff9aa2" }}>{enabled ? "运行中" : "已停用（用户端显示维护提示）"}</p>
            </div>
            <button
              type="button"
              className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
              style={{ backgroundColor: enabled ? "rgba(125,140,255,0.85)" : "rgba(95,106,150,0.4)" }}
              role="switch"
              aria-checked={enabled}
              aria-label={`${enabled ? "停用" : "启用"}${m.name}`}
              disabled={busyKey === m.key}
              onClick={() => void toggle(m.key, !enabled)}
            >
              <span
                className="absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all"
                style={{ left: enabled ? "22px" : "2px" }}
              />
              {busyKey === m.key && (
                <span className="absolute inset-0 flex items-center justify-center"><Loader2 size={12} className="animate-spin text-white/80" aria-hidden /></span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
