"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * 正文增强（PRD §5.4「代码块：右上角复制按钮、语言标签」「图片：点击放大」）。
 *
 * 为什么用 DOM 注入而不是把 HTML 转成 React 树：
 * 正文是 `dangerouslySetInnerHTML` 注入的（服务端已用统一管线渲染并净化）。
 * 把它解析成 React 节点意味着在客户端再写一套解析器/转换器，两套渲染逻辑
 * 必然漂移；而只往 `<pre>` 里挂一个按钮、给 `<img>` 挂一个点击代理，改动面最小。
 *
 * 安全性：React 对 `dangerouslySetInnerHTML` 的节点不做子节点协调，因此这里
 * 追加的 DOM 不会被回滚；但所有插入的文本都来自我们自己（语言名、固定文案），
 * 代码内容只读取不插入，不存在二次注入。
 */
export function PostEnhancer({ targetId }: { targetId: string }) {
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    const root = document.getElementById(targetId);
    if (!root) return;

    const cleanups: (() => void)[] = [];

    // ① 代码块：语言标签 + 复制按钮
    for (const pre of Array.from(root.querySelectorAll("pre"))) {
      const code = pre.querySelector("code");
      const lang = /language-([\w+#-]+)/.exec(code?.className ?? "")?.[1];
      // 标签与按钮挂在 .blog-code 外层而不是 <pre> 内：<pre> 是横向滚动容器，
      // 挂在里面的绝对定位元素会随代码一起滚走。
      const { wrapper, created } = ensureCodeWrapper(pre);
      const injected: HTMLElement[] = [];

      if (lang) {
        const span = document.createElement("span");
        span.className = "blog-code-lang";
        span.textContent = lang;
        wrapper.appendChild(span);
        injected.push(span);
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "blog-code-copy";
      btn.textContent = "复制";
      btn.setAttribute("aria-label", "复制代码到剪贴板");

      let timer: ReturnType<typeof setTimeout> | undefined;
      const onClick = () => {
        const text = code?.textContent ?? "";
        void copyText(text).then((done) => {
          btn.textContent = done ? "已复制" : "复制失败";
          btn.dataset.copied = done ? "true" : "false";
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            btn.textContent = "复制";
            delete btn.dataset.copied;
          }, 1600);
        });
      };
      btn.addEventListener("click", onClick);
      wrapper.appendChild(btn);
      injected.push(btn);

      cleanups.push(() => {
        if (timer) clearTimeout(timer);
        btn.removeEventListener("click", onClick);
        for (const node of injected) node.remove();
        if (created) unwrapCodeWrapper(wrapper, pre);
      });
    }

    // ② 图片：点击放大（事件委托，图片数量不定）
    const onClickImage = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.tagName !== "IMG") return;
      const img = target as HTMLImageElement;
      setZoom({ src: img.currentSrc || img.src, alt: img.alt || "" });
    };
    root.addEventListener("click", onClickImage);
    cleanups.push(() => root.removeEventListener("click", onClickImage));

    return () => {
      for (const c of cleanups) c();
    };
  }, [targetId]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [zoom]);

  if (!zoom) return null;

  return (
    <div
      className="blog-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      onClick={() => setZoom(null)}
    >
      <button
        type="button"
        className="icon-btn absolute right-4 top-4"
        style={{ color: "#ffffff" }}
        aria-label="关闭预览"
        onClick={() => setZoom(null)}
      >
        <X size={22} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- 预览的是已渲染的正文图片，无需再走优化管线 */}
      <img src={zoom.src} alt={zoom.alt} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

/**
 * 取（或补建）代码块外层容器。
 *
 * 渲染管线（lib/markdown.ts）会给每个 `<pre>` 包一层 `.blog-code`；
 * 这里的补建是给**历史数据**兜底——升级前发布的文章其 contentHtml 里没有这层包装，
 * 不补建就会导致复制按钮随代码横向滚动。补建出来的容器在卸载时还原。
 */
function ensureCodeWrapper(pre: HTMLPreElement): { wrapper: HTMLElement; created: boolean } {
  const existing = pre.parentElement?.closest(".blog-code");
  if (existing instanceof HTMLElement) return { wrapper: existing, created: false };

  const wrapper = document.createElement("div");
  wrapper.className = "blog-code";
  pre.parentNode?.insertBefore(wrapper, pre);
  wrapper.appendChild(pre);
  return { wrapper, created: true };
}

function unwrapCodeWrapper(wrapper: HTMLElement, pre: HTMLPreElement): void {
  const parent = wrapper.parentNode;
  if (!parent) return;
  parent.insertBefore(pre, wrapper);
  wrapper.remove();
}

/**
 * 复制文本。
 * `navigator.clipboard` 只在安全上下文可用（https / localhost）——
 * 局域网 http 部署下会抛错，因此保留 execCommand 回退。
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续走回退路径
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
