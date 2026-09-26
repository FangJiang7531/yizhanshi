# 一站式个人数字工作台

一个**模块化、可长期生长**的个人数字工作台：今天有任务清单、习惯打卡与总览，明天可以长出博客、短链、问卷，而**用户永远只看到一个统一的网站**。

> 详细架构与三份策划文档的梳理见 [`docs/架构设计说明.md`](./docs/架构设计说明.md)。

## 技术栈

Next.js 15（App Router）+ React 19 + TypeScript（strict）+ Tailwind CSS 4 + Prisma 6 + PostgreSQL + Zod + Vitest

## 快速开始

```bash
# 1) 安装依赖
npm install

# 2) 配置环境变量
cp .env.example .env        # 按需修改 AUTH_SECRET / DATABASE_URL 等

# 3) 启动内嵌开发数据库（本机无 Docker 时的替代方案）
npm run db:up

# 4) 应用数据库迁移
npm run db:migrate

# 5) 启动开发服务器
npm run dev                 # http://localhost:3000
```

## 常用脚本

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` / `npm run start` | 生产构建 / 启动 |
| `npm run verify` | **质量门禁**：typecheck + lint + 单元测试 |
| `npm run typecheck` | tsc 类型检查 |
| `npm run lint` | ESLint |
| `npm run test:unit` | 单元测试（纯函数 / Schema） |
| `npm run db:up` / `db:down` | 启停内嵌开发数据库 |
| `npm run db:migrate` / `db:deploy` | 迁移（开发 / 生产） |
| `npm run db:studio` | Prisma Studio |

## 目录结构

```
src/
├─ app/                     # 路由层：(auth) 认证、(platform) 平台外壳、api 探针
├─ components/              # 跨模块共享 UI
├─ config/                  # modules.ts 模块注册表、env.ts 环境校验
├─ lib/                     # 基础设施（auth/date/db/errors/logger/…）
├─ modules/                 # 业务模块：actions/services/repositories/schemas/components
│  └─ _template/            # 新增模块骨架
└─ styles/themes/           # 12 组语义化主题变量
```

## 架构纪律

1. **分层**：表现层 → 控制器层（Server Actions）→ 服务层 → 仓储层（Prisma）。
2. **服务层不依赖 HTTP 上下文**，`userId` / `timezone` 由控制器显式传入，可被单测直接驱动。
3. **数据隔离结构化保障**：所有业务查询第一个参数必须是 `userId`；不存在与越权同返回 `null`，不泄漏资源存在性。
4. **新增板块 = 改 `src/config/modules.ts` + 新增模块目录**。

## 质量门禁

```bash
npm run verify   # 必须全绿才能提交
```

当前：typecheck 0 错误 · lint 0 警告 · 67 个单测通过 · 生产构建 16 条路由成功。
