"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { loginAction, registerAction, requestCodeAction, verifyCodeAction } from "../actions/auth-actions";
import { passwordSchema, usernameSchema } from "../schemas";
import { useToast } from "@/components/feedback/toast";

type Tab = "login" | "register";

/** 密码强度：弱/中/强/很强 四档，并给出具体缺失项（PRD §6.2） */
function evaluatePassword(pw: string) {
  const checks = [
    { ok: pw.length >= 8, label: "至少 8 位" },
    { ok: /[a-z]/.test(pw), label: "小写字母" },
    { ok: /[A-Z]/.test(pw), label: "大写字母" },
    { ok: /[0-9]/.test(pw), label: "数字" },
    { ok: /[^A-Za-z0-9]/.test(pw), label: "特殊字符（建议）" },
  ];
  const passed = checks.filter((c) => c.ok).length;
  const level = passed <= 2 ? 0 : passed === 3 ? 1 : passed === 4 ? 2 : 3;
  return {
    checks,
    score: level,
    label: ["弱", "中", "强", "很强"][level] ?? "弱",
    color: ["var(--color-danger)", "var(--color-warning)", "var(--color-info)", "var(--color-success)"][level] ?? "var(--color-danger)",
  };
}

export function AuthPanel() {
  const [tab, setTab] = useState<Tab>("login");
  const toast = useToast();

  return (
    <div className="w-full max-w-[420px]">
      <div className="text-center mb-7">
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-[var(--radius-lg)] mb-3"
          style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-fg)" }}
          aria-hidden
        >
          <Sparkles size={24} />
        </div>
        <h1 className="text-[26px] font-semibold leading-tight">个人数字工作台</h1>
        <p className="mt-1.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          任务、习惯与更多工具，一个账号全搞定
        </p>
      </div>

      <div className="card p-6">
        <TabSwitcher tab={tab} onChange={setTab} />
        <div className="mt-5">
          {tab === "login" ? <LoginForm toast={toast} /> : <RegisterForm toast={toast} />}
        </div>
      </div>

      <ThirdPartySection toast={toast} />
      <GuestEntry toast={toast} />
    </div>
  );
}

function TabSwitcher({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div
      className="relative grid grid-cols-2 rounded-[var(--radius)] p-1"
      style={{ backgroundColor: "var(--color-bg-elevated)" }}
      role="tablist"
      aria-label="登录或注册"
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-[var(--radius-sm)] transition-transform duration-200"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          boxShadow: "var(--shadow-sm)",
          transform: tab === "login" ? "translateX(0)" : "translateX(100%)",
        }}
      />
      {(["login", "register"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          onClick={() => onChange(t)}
          className="relative z-10 py-2 text-sm font-medium rounded-[var(--radius-sm)] transition-colors"
          style={{ color: tab === t ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
        >
          {t === "login" ? "登录" : "注册"}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ 登录 ------------------------------ */

function LoginForm({ toast }: { toast: ReturnType<typeof useToast> }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await loginAction({ identifier, password });
    if (res.success) {
      toast.success("登录成功，欢迎回来");
      router.push("/dashboard");
      router.refresh();
    } else {
      setError(res.error.message);
      toast.error(res.error.message);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="账号" htmlFor="login-identifier">
        <input
          id="login-identifier"
          className="input"
          placeholder="邮箱或用户名"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          aria-invalid={Boolean(error)}
        />
      </Field>

      <Field label="密码" htmlFor="login-password">
        <div className="relative">
          <input
            id="login-password"
            className="input pr-10"
            type={showPw ? "text" : "password"}
            placeholder="请输入密码"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error)}
          />
          <button
            type="button"
            className="absolute right-1 top-1/2 -translate-y-1/2 icon-btn"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? "隐藏密码" : "显示密码"}
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </Field>

      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input type="checkbox" defaultChecked />
        <span style={{ color: "var(--color-text-secondary)" }}>记住我</span>
      </label>

      {error && <p className="field-error" role="alert">{error}</p>}

      <button type="submit" className="btn btn-primary w-full" disabled={pending || !identifier || !password}>
        {pending ? <><Loader2 size={16} className="animate-spin" /> 登录中…</> : "登录"}
      </button>
    </form>
  );
}

/* ------------------------------ 注册 ------------------------------ */

function RegisterForm({ toast }: { toast: ReturnType<typeof useToast> }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameError = username ? (usernameSchema.safeParse(username).success ? null : usernameSchema.safeParse(username).error?.issues[0]?.message ?? "用户名不合法") : null;
  const pwEval = useMemo(() => evaluatePassword(password), [password]);

  function startCountdown() {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  async function onRequestCode() {
    if (countdown > 0 || pending) return;
    setPending(true);
    setError(null);
    const res = await requestCodeAction({ email });
    if (res.success) {
      toast.success("验证码已发送，请查收邮箱（开发环境打印在服务端控制台）");
      startCountdown();
    } else {
      setError(res.error.message);
      toast.error(res.error.message);
    }
    setPending(false);
  }

  async function onVerifyCode() {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await verifyCodeAction({ email, code });
    if (res.success) {
      setSignupToken(res.data.signupToken);
      setStep(2);
      toast.success("验证通过，请设置用户名与密码");
    } else {
      setError(res.error.message);
      toast.error(res.error.message);
    }
    setPending(false);
  }

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await registerAction({ signupToken, username, password, confirmPassword });
    if (res.success) {
      toast.success("注册成功，已自动登录");
      router.push("/dashboard");
      router.refresh();
    } else {
      setError(res.error.message);
      toast.error(res.error.message);
      setPending(false);
    }
  }

  if (step === 1) {
    return (
      <div className="space-y-4">
        <Field label="邮箱" htmlFor="reg-email">
          <input
            id="reg-email"
            className="input"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="验证码" htmlFor="reg-code">
          <div className="flex gap-2">
            <input
              id="reg-code"
              className="input tracking-[0.4em] text-center"
              inputMode="numeric"
              maxLength={6}
              placeholder="6 位数字"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button
              type="button"
              className="btn btn-outline shrink-0"
              onClick={onRequestCode}
              disabled={pending || countdown > 0 || !email}
            >
              {countdown > 0 ? `${countdown}s` : "获取验证码"}
            </button>
          </div>
        </Field>

        {error && <p className="field-error" role="alert">{error}</p>}

        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={onVerifyCode}
          disabled={pending || code.length !== 6}
        >
          {pending ? <><Loader2 size={16} className="animate-spin" /> 校验中…</> : "下一步"}
        </button>
        <p className="text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
          验证码 5 分钟内有效，仅可使用一次
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onRegister} className="space-y-4" noValidate>
      <Field label="用户名" htmlFor="reg-username" hint="仅英文、数字、下划线，3–20 位">
        <input
          id="reg-username"
          className="input"
          placeholder="例如 zhang_san"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={Boolean(usernameError)}
        />
        {usernameError && <p className="field-error">{usernameError}</p>}
      </Field>

      <Field label="密码" htmlFor="reg-password">
        <div className="relative">
          <input
            id="reg-password"
            className="input pr-10"
            type={showPw ? "text" : "password"}
            placeholder="至少 8 位，含大小写字母与数字"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="absolute right-1 top-1/2 -translate-y-1/2 icon-btn"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? "隐藏密码" : "显示密码"}
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {/* 强度指示条：实时提示具体缺失项，而不是只给一个红条 */}
        {password && (
          <div className="mt-2 space-y-1.5" aria-live="polite">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-border)" }}>
                <div
                  className="h-full transition-all duration-200"
                  style={{ width: `${((pwEval.score + 1) / 4) * 100}%`, backgroundColor: pwEval.color }}
                />
              </div>
              <span className="text-xs font-medium" style={{ color: pwEval.color }}>{pwEval.label}</span>
            </div>
            <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
              {pwEval.checks.map((c) => (
                <li key={c.label} className="text-[11px] flex items-center gap-1" style={{ color: c.ok ? "var(--color-success)" : "var(--color-text-muted)" }}>
                  {c.ok ? <Check size={11} /> : <span className="inline-block w-[11px]" />}
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Field>

      <Field label="确认密码" htmlFor="reg-confirm">
        <input
          id="reg-confirm"
          className="input"
          type={showPw ? "text" : "password"}
          placeholder="再次输入密码"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={Boolean(confirmPassword) && confirmPassword !== password}
        />
        {confirmPassword && confirmPassword !== password && (
          <p className="field-error">两次输入的密码不一致</p>
        )}
      </Field>

      {error && <p className="field-error" role="alert">{error}</p>}

      <button
        type="submit"
        className="btn btn-primary w-full"
        disabled={
          pending ||
          !passwordSchema.safeParse(password).success ||
          password !== confirmPassword ||
          Boolean(usernameError) ||
          !username
        }
      >
        {pending ? <><Loader2 size={16} className="animate-spin" /> 注册中…</> : "注册并登录"}
      </button>
    </form>
  );
}

/* --------------------------- 第三方登录占位 --------------------------- */

function ThirdPartySection({ toast }: { toast: ReturnType<typeof useToast> }) {
  const providers = ["GitHub", "Google", "微信"];
  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 my-4">
        <span className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>第三方登录</span>
        <span className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {providers.map((p) => (
          <button
            key={p}
            type="button"
            className="btn btn-outline relative"
            onClick={() => toast.info(`「${p} 登录」正在接入中，敬请期待`)}
          >
            {p}
            <span
              className="absolute -top-2 -right-1 text-[10px] px-1 rounded-full"
              style={{ backgroundColor: "var(--color-warning)", color: "#fff" }}
            >
              即将支持
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ 访客入口 ------------------------------ */

function GuestEntry({ toast }: { toast: ReturnType<typeof useToast> }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function enter() {
    if (pending) return;
    setPending(true);
    const { enterGuestAction } = await import("../actions/auth-actions");
    const res = await enterGuestAction();
    if (res.success) {
      toast.info("已进入访客模式，可自由浏览");
      router.push("/dashboard");
      router.refresh();
    } else {
      toast.error(res.error.message);
      setPending(false);
    }
  }

  return (
    <div className="mt-6 text-center">
      <button
        type="button"
        className="btn btn-ghost text-sm"
        onClick={() => void enter()}
        disabled={pending}
      >
        {pending ? "进入中…" : "先随便看看 → 访客模式"}
      </button>
    </div>
  );
}

/* -------------------------------- 基础件 -------------------------------- */

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium mb-1.5">
        {label}
        {hint && <span className="ml-2 text-xs font-normal" style={{ color: "var(--color-text-muted)" }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}
