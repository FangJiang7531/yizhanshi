"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/components/feedback/toast";

export type ComingSoonStatus = "planned" | "integrating" | "coming-soon";

const STATUS_TEXT: Record<ComingSoonStatus, { title: string; body: string; step: number }> = {
  planned: {
    title: "功能开发中，即将开放",
    body: "这个板块的路线图已经排好，正在按计划推进。位置已经为你留好。",
    step: 1,
  },
  integrating: {
    title: "工具已就绪，正在接入平台",
    body: "底层工具已经开发完成，当前正在做服务化封装与平台内嵌，敬请期待。",
    step: 2,
  },
  "coming-soon": {
    title: "敬请期待",
    body: "这里是平台的扩展位，更多工具正在路上。",
    step: 0,
  },
};

/**
 * 统一占位页组件（PRD §5.4）。
 * 占位页不是敷衍：用户明确要求「预留更新板块」，一个设计得当的占位页能传达
 * 「这个位置留着，并且有人在推进」。
 */
export function ComingSoonPage({
  name,
  icon,
  description,
  status,
}: {
  name: string;
  /** 服务端渲染好的图标节点（ReactNode 可跨边界序列化，组件函数不行） */
  icon: ReactNode;
  description: string;
  status: ComingSoonStatus;
}) {
  const toast = useToast();
  const meta = STATUS_TEXT[status];

  return (
    <div className="flex min-h-[62vh] flex-col items-center justify-center text-center">
      <div
        className="mb-5 flex h-20 w-20 items-center justify-center rounded-[var(--radius-lg)]"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-muted)",
          opacity: 0.85,
        }}
        aria-hidden
      >
        {icon}
      </div>

      <h1 className="text-[26px] font-semibold">{name}</h1>

      <p className="mt-2 max-w-md text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {description}
      </p>

      <p className="mt-5 text-base font-medium" style={{ color: "var(--color-primary)" }}>
        {meta.title}
      </p>
      <p className="mt-1 max-w-sm text-sm" style={{ color: "var(--color-text-muted)" }}>
        {meta.body}
      </p>

      {/* 三层进度圆点：规划中 / 开发中 / 即将上线 */}
      <div className="mt-5 flex items-center gap-2" aria-label={`进度：第 ${meta.step + 1} 阶段`}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-full transition-colors"
            style={{
              backgroundColor: i <= meta.step ? "var(--color-primary)" : "var(--color-border)",
            }}
            aria-hidden
          />
        ))}
        <span className="ml-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
          {["规划中", "开发中", "即将上线"][meta.step]}
        </span>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => toast.info("感谢反馈！需求收集入口即将开放")}
        >
          想要什么功能？告诉我们 →
        </button>
        <Link href="/dashboard" className="btn btn-ghost">
          <ArrowLeft size={15} />
          回到总览
        </Link>
      </div>
    </div>
  );
}
