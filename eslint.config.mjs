import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "prisma/migrations/**",
      ".storage/**",
    ],
  },
  {
    rules: {
      // ── 模块解耦（策划文档 §十 风险 6）──────────────────────────────
      // 跨模块数据只能通过对方 service 层访问，禁止直接导入别的模块的 repositories。
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/repositories/*"],
              message:
                "禁止跨模块直接导入仓储层，请通过该模块的 services 层访问（模块解耦硬约束）",
            },
          ],
        },
      ],
      // ── 质量门禁（PRD §10.6：不得用 any / @ts-ignore 绕过验收）─────
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },
  {
    // 基础设施与脚本允许使用 console
    files: [
      "src/lib/logger/**",
      "src/lib/mail/**",
      "src/config/**",
      "scripts/**",
      "tests/**",
      "*.config.*",
    ],
    rules: {
      "no-console": "off",
    },
  },
];

export default eslintConfig;
