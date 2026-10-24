import type { ReactNode } from "react";

/** 公开博客侧的路由切换淡入（与平台侧 template 对齐） */
export default function PublicTemplate({ children }: { children: ReactNode }) {
  return (
    <div key="public-template" className="page-enter">
      {children}
    </div>
  );
}
