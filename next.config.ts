import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 多阶段构建需要独立运行包（见 docker/Dockerfile）
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // E2E 通过 NEXT_DIST_DIR 使用独立构建目录，避免与 dev/build 并发写坏 .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 安全响应头（Nginx 之外的第二道；开发环境同样生效便于自测）
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
