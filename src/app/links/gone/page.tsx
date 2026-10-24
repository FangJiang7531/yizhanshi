import Link from "next/link";

/** 短链失效页：过期 / 停用 / 不存在统一呈现（不泄漏具体原因） */
export default function LinkGonePage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-warning) 12%, transparent)", color: "var(--color-warning)" }}
        aria-hidden
      >
        ⌛
      </div>
      <h1 className="text-xl font-semibold">链接已失效</h1>
      <p className="max-w-sm text-sm" style={{ color: "var(--color-text-secondary)" }}>
        这条短链可能已过期或被创建者停用。如果你是创建者，请到工作台检查短链状态。
      </p>
      <Link href="/links" className="btn btn-primary btn-sm">
        前往短链工作台
      </Link>
    </div>
  );
}
