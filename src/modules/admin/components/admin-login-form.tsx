"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/feedback/toast";
import {
  adminLoginAvailableAction,
  adminLoginStep1Action,
  adminLoginStep2Action,
} from "@/modules/admin/actions/admin-auth.actions";

/**
 * 管理端登录（双因子）：① 账号密码 ② 服务器下发密钥。
 * 与用户登录完全独立；仅 role=ADMIN 账号可通过第一因子。
 */
export function AdminLoginForm() {
  const toast = useToast();
  const [stage, setStage] = useState<"account" | "key">("account");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  // 密钥是否已配置（提示部署状态，不回传密钥）；effect 内查询避免渲染期调 Server Function
  useEffect(() => {
    let alive = true;
    void adminLoginAvailableAction().then((r) => {
      if (alive) setAvailable(r.success ? r.data.available : false);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function submitAccount() {
    if (busy) return;
    setBusy(true);
    const res = await adminLoginStep1Action({ account: account.trim(), password });
    setBusy(false);
    if (!res.success) {
      toast("error", res.error.message);
      return;
    }
    setStage("key");
  }

  async function submitKey() {
    if (busy) return;
    setBusy(true);
    const res = await adminLoginStep2Action({ accessKey: accessKey.trim() });
    setBusy(false);
    if (!res.success) {
      toast("error", res.error.message);
      return;
    }
    toast("success", "管理登录成功");
    window.location.assign("/admin"); // 硬导航建立管理会话 Cookie 后进入
  }

  return (
    <div className="w-full max-w-sm">
      <div className="card p-6" style={{ backgroundColor: "color-mix(in srgb, #101733 88%, transparent)", backdropFilter: "blur(12px)", border: "1px solid color-mix(in srgb, #7d8cff 22%, transparent)" }}>
        <div className="mb-5 text-center">
          <span
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)]"
            style={{ backgroundColor: "color-mix(in srgb, #7d8cff 18%, transparent)", color: "#97a2ff" }}
            aria-hidden
          >
            <ShieldCheck size={24} />
          </span>
          <h1 className="text-lg font-semibold" style={{ color: "#e9ecff" }}>管理控制台</h1>
          <p className="mt-1 text-xs" style={{ color: "#8a92b8" }}>
            {stage === "account" ? "第一步 · 管理员账号验证" : "第二步 · 服务器密钥验证"}
          </p>
        </div>

        {stage === "account" ? (
          <div className="space-y-3">
            <input
              className="input"
              placeholder="管理员邮箱或用户名"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              aria-label="管理员账号"
              autoComplete="username"
            />
            <input
              className="input"
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submitAccount()}
              aria-label="密码"
              autoComplete="current-password"
            />
            <button type="button" className="btn btn-primary w-full" disabled={busy || !account || !password} onClick={() => void submitAccount()}>
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <LogIn size={15} aria-hidden />}
              验证账号
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="rounded-[var(--radius-sm)] px-3 py-2 text-xs" style={{ backgroundColor: "color-mix(in srgb, #7d8cff 8%, transparent)", color: "#aab2e0" }}>
              账号验证通过。请输入服务器下发的管理密钥（5 分钟内有效）。
            </p>
            <input
              className="input"
              type="password"
              placeholder="管理密钥（ADMIN_ACCESS_KEY）"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submitKey()}
              aria-label="管理密钥"
              autoFocus
            />
            <button type="button" className="btn btn-primary w-full" disabled={busy || !accessKey} onClick={() => void submitKey()}>
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <KeyRound size={15} aria-hidden />}
              进入控制台
            </button>
            <button
              type="button"
              className="btn btn-ghost w-full !text-xs"
              onClick={() => {
                setStage("account");
                setAccessKey("");
              }}
            >
              返回重新验证账号
            </button>
          </div>
        )}

        {available === false && (
          <p className="mt-4 text-center text-[11px]" style={{ color: "#ff9aa2" }}>
            服务器未配置 ADMIN_ACCESS_KEY，密钥验证不可用
          </p>
        )}
      </div>
      <p className="mt-4 text-center text-[11px]" style={{ color: "#6f78a8" }}>
        管理端与用户端相互隔离 · 仅授权管理员
      </p>
    </div>
  );
}
