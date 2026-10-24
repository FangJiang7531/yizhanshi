import { Bot, KeyRound, MessageSquareText, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import type { Metadata } from "next";
import { ModulePageHeader } from "@/components/layout/module-page-header";

export const metadata: Metadata = { title: "AI 预览 · 个人数字工作台" };

/**
 * AI 预览板块（开发预告，暂不开放）：
 * 规划版图与生态适配说明见 docs/开发计划-2026-10-24.md §AI 预览板块。
 */
const PLANS = [
  {
    icon: KeyRound,
    title: "API 密钥托管",
    desc: "导入你自己的大模型 API 密钥（OpenAI 兼容协议），密钥加密存储、仅本人可用，平台不代充、不抽成、可随时删除。",
  },
  {
    icon: MessageSquareText,
    title: "小型 Agent",
    desc: "内置对话式助手：系统提示词自定义、多轮上下文、工具调用。首批工具——文章摘要、语法润色、标签推荐。",
  },
  {
    icon: Wand2,
    title: "编辑器生态适配",
    desc: "文章编辑器内嵌 AI 助手：选中段落即可润色 / 扩写 / 翻译 / 起标题；评论区一键生成得体回复草稿。",
  },
  {
    icon: Sparkles,
    title: "全站联动",
    desc: "短链描述自动生成、书签自动打标签、总览页每日智能复盘建议。",
  },
] as const;

export default function AiPreviewPage() {
  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="AI 预览"
        subtitle="用你自己的 API 密钥，获得深度适配网站生态的小型 AI 助手 —— 正在开发"
      />

      {/* 预告横幅：与主题渐变融合 */}
      <section
        className="card relative overflow-hidden p-6"
        style={{
          background:
            "linear-gradient(120deg, color-mix(in srgb, var(--color-accent) 10%, var(--color-bg-surface)), var(--color-bg-surface) 55%, color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-surface)))",
        }}
      >
        <div className="flex items-start gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)]"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-accent) 15%, transparent)", color: "var(--color-accent)" }}
            aria-hidden
          >
            <Bot size={24} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">开发排期中 · 敬请期待</h2>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--color-text-secondary)" }}>
              AI 预览将在通知、短链、书签全量上线后开始开发。它不会是一个「通用聊天框」，
              而是长在文章编辑、评论回复、书签整理这些具体场景里的轻量助手。
            </p>
          </div>
        </div>
      </section>

      {/* 规划能力 */}
      <section aria-label="规划能力">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-text-muted)" }}>
          规划能力
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PLANS.map((p) => (
            <div key={p.title} className="card p-4">
              <p.icon size={17} style={{ color: "var(--color-accent)" }} aria-hidden />
              <h3 className="mt-2 text-sm font-semibold">{p.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 隐私红线 */}
      <section className="card flex items-start gap-3 p-4" aria-label="隐私承诺">
        <ShieldCheck size={18} style={{ color: "var(--color-success)" }} aria-hidden />
        <div className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          <b style={{ color: "var(--color-text-primary)" }}>隐私红线：</b>
          AI 请求只携带你明确选中的内容；密钥永不写入日志；你可随时一键删除全部 AI 数据（含密钥与对话记录）。
        </div>
      </section>
    </div>
  );
}
