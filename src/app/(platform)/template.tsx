import type { ReactNode } from "react";

/**
 * 路由切换动画载体：template.tsx 在每次导航时重新挂载，
 * 让内容区以「淡入 + 轻微上移」的方式进入，实现板块间丝滑切换。
 * 布局（侧边栏/顶栏）不重挂载，与 PRD「外壳常驻」规则一致。
 */
export default function PlatformTemplate({ children }: { children: ReactNode }) {
  return (
    <div key="platform-template" className="page-enter">
      {children}
    </div>
  );
}
