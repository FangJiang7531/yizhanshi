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
npm run db:up               # Windows 中文系统下自动把 PG 二进制镜像到 ASCII 路径规避 initdb 编码崩溃

# 4) 应用数据库迁移
npm run db:migrate

# 5) 灌入演示数据（可选）
npm run db:seed             # 演示账号 demo@example.com / Demo1234（用户名 demo）

# 6) 启动开发服务器
npm run dev                 # http://localhost:3000
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接串 |
| `AUTH_SECRET` | ✅ | ≥32 字符（`openssl rand -base64 32` 生成）；用于会话/验证码 HMAC 签名 |
| `APP_URL` | ✅ | 应用对外地址（默认 http://localhost:3000） |
| `LOG_LEVEL` |  | debug / info / warn / error（默认 info） |
| `MAIL_FROM` |  | 发件人地址；开发环境验证码直接打印到服务端控制台 |
| `STORAGE_DRIVER` / `STORAGE_LOCAL_DIR` |  | 存储抽象（local / s3），本期实现本地磁盘适配器 |
| `TOOL_SERVICE_DOWNLOADER_URL` / `TOOL_SERVICE_DOCCONVERT_URL` / `TOOL_SERVICE_TOKEN` |  | 阶段六存量工具服务接入（本期仅接口） |
| `CRON_SECRET` |  | 定时任务端点鉴权 |

配置由 `src/config/env.ts` 用 Zod 集中校验，缺失或非法时启动即退出（快速失败）。

## Docker 部署

```bash
cd docker
AUTH_SECRET=$(openssl rand -base64 32) docker compose up -d --build
curl http://localhost:3000/api/health    # {"status":"ok"}（/api/ready 会检查数据库连通性）
```

多阶段构建（deps → builder → runner），基于 node:20-alpine、非 root 用户运行、`output: standalone`；容器入口自动执行 `prisma migrate deploy`。

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
npm run verify            # typecheck + lint + 单元测试，必须全绿才能提交
npm run test:integration  # 集成测试：真实 PostgreSQL（隔离/软删除/幂等打卡/级联/Argon2id）
npm run test:e2e          # Playwright：注册→登录→建任务→勾选→建习惯→打卡→总览→切主题
```

当前：typecheck 0 错误 · lint 0 error · 单测 67 条（streak 边界 B-01~B-10 / 时区 B-11、B-12 / Zod Schema）· 集成 28 条（跨用户隔离 C-01、C-02 / 打卡幂等 B-13 / 密码存储 A-05）。

## 常见问题

| 问题 | 处置 |
|------|------|
| Windows 下 `db:up` initdb 失败 | 脚本已自动镜像二进制到 `%USERPROFILE%\.pwb-pg-bin`（ASCII 路径）；数据目录在 `%USERPROFILE%\.pwb-pgdata` |
| 端口 5433 被占用 | `DEV_DB_PORT=5434 npm run db:up`，并同步修改 `.env` 的 `DATABASE_URL` |
| 集成测试报「测试库不可用」 | 先运行 `npm run db:up`（会创建 `personal_workbench_test` 并同步 schema） |
| 主题切换没有扩散动画 | 浏览器不支持 View Transitions 或系统开启「减少动态效果」，自动降级为瞬时切换 |
| 登录提示「邮箱/用户名或密码错误」 | 有意统一文案（防账号枚举），请核对凭据 |
