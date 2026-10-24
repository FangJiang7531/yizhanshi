"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * 二维码（SVG）：基于 qrcode 包（成熟实现，容错等级 M）。
 * 客户端生成——SSR 无 canvas 依赖，主题一致性好。
 */
export function QRCodeSVG({ value, size = 120 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    QRCode.toString(value, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      width: size,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((s) => {
        if (alive) {
          setSvg(s);
          setFailed(false);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [value, size]);

  if (failed) {
    return (
      <span
        className="flex items-center justify-center rounded-[var(--radius-sm)] text-[11px]"
        style={{ width: size, height: size, backgroundColor: "var(--color-bg-elevated)", color: "var(--color-text-muted)" }}
      >
        链接过长
      </span>
    );
  }

  if (!svg) {
    return <span className="skeleton block rounded-[var(--radius-sm)]" style={{ width: size, height: size }} />;
  }

  return (
    <span
      className="block overflow-hidden rounded-[var(--radius-sm)]"
      style={{ width: size, height: size }}
      role="img"
      aria-label="文章二维码"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
