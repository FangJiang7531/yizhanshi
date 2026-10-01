# 一站式个人数字工作台（personal-workbench）

一个**模块化、可长期生长**的个人数字工作台：今天有任务清单、习惯打卡与总览，明天可以长出博客、短链、问卷，而**用户永远只看到一个统一的网站**。

| | |
|---|---|
| **你想直接使用** | → 看 [一、使用指南](#一使用指南普通用户) |
| **你想在本地跑起来改代码** | → 看 [二、开发者指南](#二开发者指南) |
| **你想部署一套完整服务** | → 看 [三、部署指南](#三部署指南完整全栈部署)（含 [3.0 服务器系统与环境要求](#30-云服务器系统与环境要求)） |

> 架构与策划文档梳理见 [`docs/架构设计说明.md`](./docs/架构设计说明.md)，第一阶段验收结论见 [`docs/test-report-v0.1.0.md`](./docs/test-report-v0.1.0.md)，2026-09-30 全面检测结论见 [`../检测报告-2026-09-30.md`](../检测报告-2026-09-30.md)。

---

## 功能总览

| 板块 | 状态 | 能力 |
|------|------|------|
| 总览 `/dashboard` | ✅ 可用 | 问候语（按你所在时区）、今日完成统计、最长连续打卡、今日任务/习惯直达操作、全板块快捷入口 |
| 任务清单 `/tasks` | ✅ 可用 | 新增/编辑/删除、今天·全部·已完成过滤、标题+描述搜索（命中高亮）、优先级筛选、按截止/优先级/创建时间排序、优先级、截止日期、彩色标签、拖拽排序 |
| 习惯打卡 `/habits` | ✅ 可用 | 自建习惯（24 图标 / 12+自定义颜色 / 每周目标）、每日打卡、连续天数、完成率、当月热力图、卡片/列表双视图、归档与一键恢复 |
| 博客 `/blog` | ✅ 可用 | 公开阅读（发现/详情/作者/标签页，ISR 静态化）、全文搜索（pg_trgm 模糊匹配+高亮）、点赞/转发/分享、Markdown 两级评论 + SSE 实时推送、创作中心（CodeMirror 编辑器/三层自动保存/冲突检测/实时预览/数据卡片）、SEO 体系（RSS/sitemap/robots/JSON-LD/动态 OG 图）、敏感词过滤 + 审核队列 |
| 设置 `/settings` | ✅ 可用 | 6 套主题 × 明暗（即时预览）、时区/每周起始日/语言、每日提醒偏好、关于 |
| 短链 / 书签 / 问卷 / 视频下载 / 文档转换 | 🔒 预留 | 路由与占位页就绪，展示开发进度与需求收集入口 |

安全基线：Argon2id 密码哈希、数据库 Session（HttpOnly Cookie）、所有查询强制按用户隔离、注册/登录/发码限流、Zod 服务端校验。

---

## 一、使用指南（普通用户）

### 1. 进入平台

打开站点后你会先看到**登录页**，有三种进入方式：

| 方式 | 适合 | 说明 |
|------|------|------|
| **访客模式**（「先随便看看」） | 想先体验 | 可浏览全部界面、切换板块与主题；任何写操作（如新增任务）会弹出说明对话框，注册后解锁 |
| **注册新账号** | 首次使用 | 切到「注册」页签 → 填邮箱 → 点「获取验证码」→ 填 6 位验证码 → 设置用户名和密码 → 自动登录 |
| **登录** | 老用户 | 邮箱**或**用户名 + 密码 |

账号规则：用户名仅英文/数字/下划线（3–20 位，不分大小写）；密码至少 8 位，**包含字母和数字即可**（特殊字符与更长位数只作为强度建议，不作强制）。

> **验证码怎么收到？** 验证码通过邮件真实发送（SMTP 配置见[部署指南 3.3](#33-注册验证码邮件smtp-真实投递)）。若服务器未配置 SMTP（三要素留空），验证码降级打印到服务端控制台/容器日志，由管理员转告。

### 2. 任务清单

- **新增**：右上角「＋ 新增任务」，支持标题（必填）、描述（2000 字内）、截止日期（今天/明天/下周快捷键）、优先级（高/中/低）、标签（可现场新建并选颜色）。
- **找任务**：顶部搜索框输入即过滤（匹配标题和描述，命中文字高亮）；「今天 / 全部 / 已完成」三个页签切换视图。
- **完成任务**：点左侧复选框，划线置灰；再点恢复。
- **整理**：按住任务行**拖拽**可调整顺序；悬停行出现「编辑 / 删除」图标，删除需二次确认。
- **截止提醒**：截止日期显示「今天 / 明天 / M月D日」，逾期显示红色「已逾期」。

### 3. 习惯打卡

- **建习惯**：「＋ 新增习惯」，选颜色、图标、每周目标天数。
- **打卡**：点卡片上「今日打卡」，按钮变实心 ✓、连续天数滚动递增、当月热力图对应格子亮起。重复点击不会产生重复记录。
- **取消打卡**：点「✓ 已打卡」并二次确认，数字与热力图回退。
- **看坚持**：🔥 连续 N 天（今天没打卡不算断，当天可补）、完成率（只按已过天数算）、当月热力图（悬停看每日状态）。
- **归档 vs 删除**：归档=从列表隐藏但历史全保留；删除=不再展示（历史保留在库中）。

### 4. 总览与设置

- **总览**：第一眼看到今天要做什么——今日任务可直接勾选、今日习惯可直接打卡、两张统计卡片、全部板块快捷入口。
- **设置**（右上角头像 → 设置）：6 套主题（米黄书页 / 科技感 / 植物绿 / 现代简约 / 纯白 / 纯黑）× 浅色/深色/跟随系统，改完立即生效并保存到账号；顶栏的太阳/月亮按钮一键切换明暗；偏好分区可改时区、每周起始日、语言。
- 主题偏好跟随账号：换设备登录后自动恢复。

### 5. 博客

**读（无需登录）**：

- **发现页 `/blog`**：最新发布与热门文章、标签导航；文章详情页静态化 + 每小时增量更新（ISR），浏览/点赞/转发计数实时可见；
- **搜索 `/blog/search`**：输入至少 2 个字符即自动搜索（PostgreSQL pg_trgm 模糊匹配），标题命中高亮，可按标签过滤；
- **作者页 / 标签页**：`/blog/u/用户名`、`/blog/tags/标签`，均支持 RSS 订阅（页尾订阅链接，地址后加 `/rss.xml`）；
- **SEO**：每篇文章自动生成社交分享卡（OG 图）、结构化数据（JSON-LD），`/sitemap.xml` 与 `/robots.txt` 对搜索引擎就绪。

**互动（需登录）**：

- **点赞 / 转发**：详情页底部一键操作，带数字滚动动画；转发可附 200 字以内评论，随时取消；
- **评论**：支持 Markdown（工具条快捷插入）、两级回复（回复他人会 @ 通知语境）、按最新/最热排序；**实时刷新**——他人新评论通过 SSE 长连接自动出现，无需手动刷新，断线自动重连。

**写（需登录）**：

- 入口在「我的文章 `/blog/me`」：新建文章进入编辑器——**自动保存**三保险（本地缓存 / 服务端草稿 / 发布内容分层防丢）、多端编辑**冲突检测**、右侧实时预览（与发布后渲染一致）、标题即时生成永久短链（slug）；
- 发布流转：提交后进入审核队列（管理员审核通过才对外可见），驳回会给出意见；草稿永远只有自己可见；
- **数据卡片**：我的文章页展示近 7 日浏览/点赞/转发趋势，帮助判断选题；
- 图片：正文支持插图上传（本地磁盘存储，部署时可切换 S3）。

**管理（仅管理员）**：

- **审核队列 `/blog/moderation`**：待审文章与评论双池，通过 / 驳回（驳回必填意见）；正文与评论在发布前后均经过敏感词引擎（AC 自动机）与 Markdown 白名单净化（防 XSS）。

---

## 二、开发者指南

### 2.1 环境要求

- Node.js ≥ 20 LTS、npm ≥ 10
- PostgreSQL 16（本地有 Docker 用 Docker；没有就用仓库自带内嵌 PostgreSQL）
- 可选：Docker（完整部署用，见第三节）

### 2.2 本地启动（5 步）

```bash
# 1) 安装依赖
npm install

# 2) 配置环境变量
cp .env.example .env        # 开发默认值即可跑通；AUTH_SECRET 可用 openssl rand -base64 32 生成

# 3) 启动数据库（两种方式二选一）
npm run db:up               # 方式 A：内嵌 PostgreSQL 17（免安装，推荐个人开发机）
# docker run -d --name pwb-postgres-dev \
#   -e POSTGRES_USER=pwb -e POSTGRES_PASSWORD=pwb_dev_password \
#   -e POSTGRES_DB=personal_workbench_dev -p 5433:5432 postgres:16-alpine   # 方式 B：Docker

# 4) 建表 + 灌演示数据（可选）
npm run db:migrate          # 执行 prisma migrate dev
npm run db:seed             # 演示账号：demo@example.com / Demo1234（用户名 demo）

# 5) 启动开发服务器
npm run dev                 # http://localhost:3000
```

> **Windows 中文系统**：`db:up` 会自动把 PostgreSQL 二进制镜像到 `%USERPROFILE%\.pwb-pg-bin`（ASCII 路径）再启动——PostgreSQL 二进制路径含非 ASCII 字符时 initdb 会因 GBK 编码错乱崩溃，脚本已内置规避。数据目录在 `%USERPROFILE%\.pwb-pgdata`。

### 2.3 常用脚本

| 命令 | 作用 |
|------|------|
| `npm run dev` / `build` / `start` | 开发 / 生产构建 / 生产启动 |
| `npm run verify` | **质量门禁**：typecheck + lint + 单元测试（提交前必须全绿） |
| `npm run typecheck` / `lint` | 单项检查 |
| `npm run test:unit` | 单元测试（streak 边界 / 时区 / Schema） |
| `npm run test:integration` | 集成测试（真实 PostgreSQL：隔离/软删除/幂等/级联） |
| `npm run test:e2e` | Playwright 端到端（CI 用；本机推荐 `node scripts/e2e-isolated.mjs`，见下） |
| `node scripts/e2e-isolated.mjs` | 逐用例隔离 E2E 驱动（规避本机驱动偶发冻结；需先起 dev 服务器） |
| `npm run db:up` / `db:down` | 内嵌数据库启停（自动建 dev + test 两个库并同步 schema） |
| `npm run db:migrate` / `db:deploy` | 迁移（开发交互式 / 生产只执行已提交迁移） |
| `npm run db:seed` / `db:studio` | 种子数据 / Prisma Studio |

### 2.4 测试体系

```bash
npm run verify              # 提交前门禁
npm run test:integration    # 真实 PostgreSQL（测试库由 db:up 自动创建）
node scripts/e2e-isolated.mjs   # E2E：注册→登录→任务→习惯→总览→主题→访客限制
```

- 单测 198 条：博客（Markdown 净化/敏感词/SEO/RSS/schema/图片/路由可见性矩阵/守卫结构断言）+ streak 三口径固定数据集（B-01~B-10）、时区（B-11/B-12）、Zod Schema；
- 集成 141 条：博客（仓储/服务/计数并发一致性/公开页/图片/评论与搜索）+ 跨用户隔离、越权（读/写/删/挂标签/排序）、软删除、分页、打卡幂等、级联、Argon2id、拖拽排序；
- 检测期验证 26 条（`tests/verify/`）：XSS 惰性化 13 + 跨用户越权 9 + 部署链路契约 4（详见 [`tests/verify/README.md`](./tests/verify/README.md)）；
- E2E 7 段：全链路用户旅程（验证码走开发专用捕获端点 `/api/dev/last-code`，仅在 `NODE_ENV=development && E2E_CAPTURE_CODE=1` 时启用）。

> **合计 365 条用例**，全量执行 `npx vitest run` 实测 24 文件 / 365 通过 / 0 失败（约 66 秒）。

### 2.5 目录结构与扩展纪律

```
src/
├─ app/                     # 路由层：(auth) 认证、(platform) 平台外壳、api 探针
├─ components/              # 跨模块共享 UI（ui/layout/theme/feedback）
├─ config/                  # modules.ts 模块注册表、env.ts 环境校验、version.ts
├─ lib/                     # 基础设施：errors/logger/db/auth/date/mail/storage/jobs/rate-limit/tools
├─ modules/                 # 业务模块：actions / services / repositories / schemas / components
│  ├─ auth/ tasks/ habits/ analytics/
│  ├─ blog/                 # 博客：actions / services / repositories / components / hooks / lib
│  └─ _template/            # 新增模块脚手架（复制即用）
└─ styles/themes/           # 6 主题 × 明暗语义变量表
tests/{unit,integration,e2e,verify}/   # verify/ 为检测期定向回归用例
docker/{Dockerfile,entrypoint.sh,docker-compose.yml,docker-compose.prod.yml}
prisma/{schema.prisma,migrations/,seed.ts}
.dockerignore              # 构建上下文排除清单（node_modules/.next/.env…）
```

四条不可协商的纪律（ESLint/评审强制）：

1. **新增板块 = 改 `src/config/modules.ts` + 复制 `_template/`**，侧边栏/占位页/快捷入口自动生效；
2. **服务层不碰 HTTP 上下文**（无 `cookies()/headers()`），`userId`/`timezone` 由控制器显式传入，保证可单测；
3. **所有业务查询首参 `userId`**；「不存在」与「不属于你」统一 404，不泄漏存在性；
4. **组件只用 `--color-*` 语义变量**，禁止硬编码色值（纯黑主题依赖这一点）。

---

## 三、部署指南（完整全栈部署）

架构：**Nginx（TLS/反代）→ Next.js standalone 容器 → PostgreSQL 16 容器**。部署完成后，任何人通过浏览器访问你的域名即可注册账号使用——所有数据按账号严格隔离，互不可见。

**三条部署路线，按拥有什么资源选择：**

| 路线 | 适合 | 关键步骤 |
|------|------|---------|
| **A. 云服务器 + 源码构建** | 有云服务器，想最新代码 | 克隆仓库 → `docker compose up -d --build`（见 3.1–3.2，随后做 3.4 HTTPS） |
| **B. 拉取现成镜像** | 服务器上不想装构建环境 | `docker pull` GHCR 镜像 → `docker-compose.prod.yml` 启动（见 3.2b） |
| **C. 物理机直装** | 本地电脑/内网服务器，不用 Docker | 装 Node 20 + PostgreSQL → `npm ci && npm run build` → systemd/pm2 常驻（见 3.2c） |

### 3.0 云服务器系统与环境要求

**推荐配置**：`Ubuntu 22.04 LTS / 24.04 LTS`（x86_64）。其余 Linux 发行版同样可用，只是包管理命令不同。

#### 服务器规格

| 规模 | CPU | 内存 | 磁盘 | 说明 |
|------|-----|------|------|------|
| 个人自用（推荐起步） | 2 vCPU | 4 GB | 40 GB SSD | 足够源码构建 + 运行；构建瞬时峰值约 2.5 GB 内存 |
| 小团队（≤ 20 人） | 4 vCPU | 8 GB | 80 GB SSD | 余量充足，构建不会因内存紧张被 OOM Killer 终止 |
| 仅拉镜像部署（路线 B） | 1 vCPU | 2 GB | 20 GB SSD | 无需构建，内存需求大幅下降 |

> ⚠️ **1C2G 的机器不建议走路线 A（源码构建）**：`next build` + `prisma generate` 内存峰值易触发 OOM Killer，表现为构建中途进程被杀。

#### 软件环境（路线 A / B：Docker 方案）

| 组件 | 版本要求 | 说明 |
|------|---------|------|
| 操作系统 | Linux 内核 ≥ 5.15 | Ubuntu 22.04/24.04、Debian 12、AlmaLinux 9 均可 |
| Docker Engine | ≥ 24.0 | 需支持 BuildKit（`docker buildx`） |
| Docker Compose | ≥ v2.20（插件版） | 使用 `docker compose`（空格）而非 `docker-compose`（连字符） |
| PostgreSQL | **无需单独安装** | 由 compose 的 `postgres:16-alpine` 容器提供 |
| Node.js | **无需单独安装** | 构建与运行都在容器内完成 |
| 中文字体 | 可选 | 博客 OG 分享图需中文 .ttf，见下方「中文字体」说明 |

**镜像内固定版本**（无需你在服务器上处理）：

- 基础镜像 `node:20-alpine`（Node 20 LTS）
- 数据库 `postgres:16-alpine`（PostgreSQL 16）
- 应用以非 root 用户 `nextjs`（uid 1001）运行，监听容器内 `3000` 端口

#### 软件环境（路线 C：物理机直装）

| 组件 | 版本要求 | 安装方式 |
|------|---------|---------|
| Node.js | **≥ 20 LTS**（推荐 20.x 或 22.x） | `nvm` / NodeSource 仓库 / 官方安装包 |
| npm | ≥ 10 | 随 Node 附带 |
| PostgreSQL | **16 或 17** | `apt install postgresql-16`，或官方仓库 |
| 构建工具 | build-essential、python3 | Argon2 等原生模块编译需要 |
| 中文字体 | 可选 | `apt install fonts-wqy-zenhei` |

> **仅当走路线 C 时**才需要在服务器上安装 Node 与 PostgreSQL。路线 A/B 完全容器化。

#### 域名与网络

| 项 | 要求 |
|----|------|
| 域名 | 一个已备案/可用的域名，A 记录解析到服务器公网 IP（HTTPS 需要；纯内网用 `IP:3000` 访问可跳过） |
| 端口放行 | 安全组/防火墙放行 **80** 与 **443**；**不要**对外暴露 `3000` 与 `5432` |
| 带宽 | 1 Mbps 起（个人使用足够）；有图片上传建议 ≥ 3 Mbps |

#### 中文字体（OG 分享图）

博客的文章分享卡需要中文 `.ttf` 字体，否则中文显示为方框（`□□□`）：

- **路线 A/B（容器）**：镜像基于 Alpine，默认无中文字体。挂载字体并指定路径：
  ```yaml
  # docker-compose.yml 的 app 服务追加
  volumes:
    - /usr/share/fonts/truetype/wqy/wqy-zenhei.ttf:/app/fonts/cn.ttf:ro
  environment:
    OG_FONT_PATH: /app/fonts/cn.ttf
  ```
  宿主机字体可用 `apt install fonts-wqy-zenhei` 安装；
- **路线 C（物理机）**：`apt install fonts-wqy-zenhei` 后通常可被自动探测（`simhei` / `DengB` / `DengR` 探测链）；未命中再用 `OG_FONT_PATH` 指定。
- **不支持 `.ttc`**（字体集合格式），必须是单个 `.ttf`。

#### 一键环境自检（部署前执行）

```bash
# 线路 A/B 自检
docker --version                # 期望 Docker version 24.x 以上
docker compose version          # 期望 Docker Compose version v2.20 以上
docker buildx version           # 有输出即支持 BuildKit
free -h                         # 内存 ≥ 4G（走源码构建时）
df -h /                         # 可用磁盘 ≥ 20G
uname -m                        # x86_64（ARM 亦支持，镜像多架构构建）

# 线路 C 自检
node -v                         # 期望 v20.x / v22.x
psql --version                  # 期望 16.x 或 17.x
```

#### 首次部署耗时预期（2C4G）

| 阶段 | 耗时 |
|------|------|
| 拉取基础镜像（`node:20-alpine`、`postgres:16-alpine`） | 1–3 分钟（视网络） |
| `npm ci` 安装依赖 | 2–4 分钟 |
| `next build` 生产构建 | 2–5 分钟 |
| `prisma migrate deploy` 建表 | < 10 秒 |
| **合计** | **约 6–12 分钟** |

> 后续升级因为 Docker 层缓存，通常 1–3 分钟即可完成。

### 3.1 准备服务器与配置

要求：2C4G 起的服务器（云主机、VPS 或内网物理机均可）、已安装 Docker 与 Docker Compose 插件；公网域名 + DNS 解析到服务器 IP（HTTPS 需要；纯内网用 IP:端口访问可跳过）。

```bash
# 在项目根目录创建部署环境文件（不入库）
cat > docker/.env <<'EOF'
POSTGRES_PASSWORD=换成强密码
AUTH_SECRET=换成openssl生成的32位以上随机串
APP_URL=https://workbench.example.com
EOF
# 生成 AUTH_SECRET：openssl rand -base64 32
chmod 600 docker/.env
```

### 3.2 路线 A：源码构建并启动

```bash
git clone <你的仓库地址> personal-workbench && cd personal-workbench
cd docker
docker compose up -d --build

# 验证
curl http://127.0.0.1:3000/api/health   # {"status":"ok"}          liveness
curl http://127.0.0.1:3000/api/ready    # {"status":"ok","db":"connected"}  readiness（查库）
docker compose logs -f app              # 观察启动：等库就绪 → prisma migrate deploy → server 启动
```

说明：

- 镜像为多阶段构建（deps → builder → runner），基于 `node:20-alpine`、非 root 用户运行、`output: "standalone"`；
- 容器入口（`docker/entrypoint.sh`）会等数据库就绪后自动执行 `prisma migrate deploy`，升级时无需手工迁移；
- 数据持久化在 `pgdata` 卷，应用文件在 `storage` 卷。

### 3.2b 路线 B：拉取镜像直接部署

打 `v*` 标签推送时，CI（`.github/workflows/release.yml`）会自动把镜像发布到 GitHub Container Registry。部署机器上：

```bash
# 1) 登录 GHCR（公开镜像可跳过；私有镜像需 PAT：read:packages）
echo $GHCR_TOKEN | docker login ghcr.io -u <github用户名> --password-stdin

# 2) 准备配置（同 3.1，文件放 docker/.env，额外指定镜像所有者）
export GHCR_OWNER=<github用户名小写>      # 镜像位于 ghcr.io/<owner>/personal-workbench

# 3) 拉取镜像（在项目 docker/ 目录下）
docker compose -f docker-compose.prod.yml pull

# 4) 启动（同样自动迁移、自动健康检查）
docker compose -f docker-compose.prod.yml up -d
curl http://127.0.0.1:3000/api/ready
```

升级版本：`export APP_VERSION=v0.1.0 && docker compose -f docker-compose.prod.yml up -d`（回滚同理，换版本号即可）。

> 推自己的镜像：本地 `docker build -f docker/Dockerfile -t ghcr.io/<owner>/personal-workbench:v0.1.0 . && docker push ...`，或直接打 tag 让 CI 发布。

### 3.2c 路线 C：物理机直装（无 Docker）

适合不想引入 Docker 的 Windows/Linux 物理机或内网主机。

```bash
# 前置：Node.js ≥ 20（node -v 验证）+ PostgreSQL 16 本机安装并创建库
#   createdb -U postgres personal_workbench

# 1) 源码与依赖
git clone <你的仓库地址> && cd personal-workbench
npm ci

# 2) 配置 .env（cp .env.example .env 后修改）
#    DATABASE_URL=postgresql://pwb:<密码>@localhost:5432/personal_workbench
#    AUTH_SECRET=<openssl rand -base64 32>
#    APP_URL=http://<本机局域网IP>:3000

# 3) 初始化并启动
npx prisma migrate deploy     # 建表（升级时同样执行）
npm run build
npm start                     # 生产模式监听 3000

# 4) 常驻运行（Linux systemd 示例，Windows 可用 nssm 或「任务计划程序」）
sudo tee /etc/systemd/system/pwb.service <<'EOF'
[Unit]
Description=Personal Workbench
After=network.target postgresql.service
[Service]
WorkingDirectory=/opt/personal-workbench
EnvironmentFile=/opt/personal-workbench/.env
ExecStart=/usr/bin/npm start
Restart=always
User=www-data
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now pwb
```

内网其他电脑浏览器访问 `http://<本机IP>:3000` 即可注册使用；如需域名与 HTTPS，仍按 3.4 配 Nginx 反代到 3000 端口。

### 3.2d 云服务器首次部署：从零到可访问（Ubuntu 22.04/24.04 完整流程）

以路线 A 为例，从一台**全新 Ubuntu 服务器**到站点可访问的完整命令序列（复制即用）：

```bash
# ============ 步骤 1：安装 Docker（官方脚本，含 compose 插件）============
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # 免 sudo 使用 docker；执行后重新登录 SSH 生效
newgrp docker                      # 当前会话立即生效（或断开重连）

# 校验
docker --version && docker compose version

# ============ 步骤 2：系统基础配置 ============
sudo apt update && sudo apt install -y git openssl

# 时区设为东八区（影响日志时间与定时任务）
sudo timedatectl set-timezone Asia/Shanghai

# ============ 步骤 3：拉取代码 ============
sudo mkdir -p /opt && sudo chown $USER:$USER /opt
git clone <你的仓库地址> /opt/personal-workbench
cd /opt/personal-workbench/docker

# ============ 步骤 4：配置环境变量（务必改这三项）============
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
AUTH_SECRET=$(openssl rand -base64 32)
APP_URL=http://$(curl -s ifconfig.me)
EOF
chmod 600 .env
cat .env                            # 确认三项都已生成

# ============ 步骤 5：构建并启动 ============
docker compose up -d --build

# ============ 步骤 6：验证 ============
sleep 20
docker compose ps                              # 两个服务都应 running/healthy
curl -s http://127.0.0.1:3000/api/health       # {"status":"ok"}
curl -s http://127.0.0.1:3000/api/ready        # {"status":"ok","db":"connected"}
docker compose logs --tail=40 app              # 应看到 migrate deploy 完成 + server 启动
```

> **注意**：`docker/.env` 中的 `AUTH_SECRET` 一旦投入使用**不可更换**——更换会导致全部已登录会话与未使用的验证码立即失效。

#### 用 systemd 托管（可选，实现开机自启）

Docker 容器已配 `restart: unless-stopped`，服务器重启后会自动拉起。若希望 `docker compose` 也随系统启动，可加一个单元：

```bash
sudo tee /etc/systemd/system/pwb.service <<'EOF'
[Unit]
Description=Personal Workbench (docker compose)
Requires=docker.service
After=docker.service network-online.target
[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/personal-workbench/docker
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now pwb
```

#### 防火墙配置（仅放行必要端口）

```bash
# ufw（Ubuntu 默认）
sudo ufw allow 22/tcp        # SSH（先放行，避免把自己锁在外面）
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
# ⚠️ 不要放行 3000 与 5432：应用与数据库只在容器网络内可达，由 Nginx 对外暴露
```

> 若使用云厂商（阿里云/腾讯云/华为云等），**还需在控制台安全组中放行 80/443**——`ufw` 只控制系统防火墙，安全组是独立的一层。

#### 全流程验收清单

| # | 检查项 | 命令 | 期望 |
|---|--------|------|------|
| 1 | 容器均在运行 | `docker compose ps` | `postgres` 与 `app` 均 `running`/`healthy` |
| 2 | 应用存活 | `curl -sI localhost:3000/api/health` | `200` |
| 3 | 数据库连通 | `curl -s localhost:3000/api/ready` | `{"status":"ok","db":"connected"}` |
| 4 | 迁移已执行 | `docker compose exec postgres psql -U pwb -d personal_workbench -c '\dt'` | 27 张表 |
| 5 | 外网可访问 | 浏览器打开 `http://<服务器IP>` | 显示登录页 |
| 6 | 注册流程 | 点「获取验证码」→ 查日志 | `docker compose logs app \| grep 验证码` 有输出 |
| 7 | HTTPS（如已配） | 浏览器访问 `https://域名` | 证书有效、锁标正常 |
| 8 | 数据持久化 | `docker compose restart app` 后刷新 | 登录态与数据仍在 |

### 3.2e 云服务器故障排查

| 现象 | 原因 | 处置 |
|------|------|------|
| `app` 容器反复重启，日志只有「等待数据库就绪…」 | 数据库未就绪或连接串错误 | `docker compose logs postgres` 看 PG 是否健康；确认 `POSTGRES_PASSWORD` 一致 |
| 日志报 `Cannot find module 'pg'` | 镜像 runner 阶段缺 `pg` 运行时依赖（历史缺陷，v0.1.0 已修） | 更新到含修复的版本后 `docker compose up -d --build` 重建镜像 |
| `docker compose up` 报 `manifest unknown` | 路线 B 拉取的镜像 tag 不存在 | 核对 `GHCR_OWNER`、`APP_VERSION`，并确认 GHCR 中该 tag 已发布 |
| 启动即退出并提示 `AUTH_SECRET` 缺失 | 环境变量未提供 | 检查 `docker/.env` 存在且含 `AUTH_SECRET`（≥ 32 字符）；`chmod 600 .env` |
| `npm ci` 或 `next build` 被 Killed | 内存不足触发 OOM | 升配到 4 GB，或添加 swap：`sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| 构建极慢 | 未走 BuildKit 或网络差 | 确认 `docker buildx version` 有输出；国内可配镜像加速器 `/etc/docker/daemon.json` |
| 域名打不开但 `curl localhost:3000` 正常 | 安全组/防火墙未放行 80 | 同时检查云控制台安全组与 `ufw status` |
| OG 分享图中文显示方框 | 容器缺中文字体 | 按 [3.0 中文字体](#中文字体og分享图) 挂载字体并设 `OG_FONT_PATH` |
| 页面能开但样式丢失 | Nginx 未正确转发或静态资源 404 | 检查 Nginx `proxy_pass` 与 `X-Forwarded-Proto`；确认 `.next/static` 在镜像中（重建镜像） |
| 502 Bad Gateway | 应用未启动或端口不符 | `docker compose ps` 看 app 状态；确认 Nginx 反代到 `127.0.0.1:3000` |
| 磁盘写满 | 镜像层/日志/备份堆积 | `docker system prune -a`（慎用）、`docker compose logs` 配置轮转、迁移备份目录到对象存储 |

### 3.3 注册验证码邮件（SMTP 真实投递）

**按环境自动选择适配器**：

- `.env` 中 `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` 三要素齐备 → **SmtpMailAdapter**，验证码通过 SMTP 真实发到用户邮箱；
- 任一缺失（或 E2E 捕获模式 `E2E_CAPTURE_CODE=1`）→ **ConsoleMailAdapter**，验证码打印在应用日志中。

**QQ/Foxmail 邮箱配置示例**（授权码在邮箱「设置 → 账号 → POP3/SMTP 服务」生成）：

```bash
# .env
SMTP_HOST="smtp.qq.com"
SMTP_PORT="465"          # 465 走 SSL；587 请改为 587 并设置 SMTP_SECURE="false"（STARTTLS）
SMTP_SECURE="true"
SMTP_USER="you@example.qq.com"
SMTP_PASS="你的SMTP授权码"   # 不是邮箱登录密码！
MAIL_FROM=""             # 留空自动使用 SMTP_USER（QQ 要求发件人=认证账号）
```

**验证通道**：`node scripts/smtp-verify.mjs` 会用当前 `.env` 配置向发件邮箱自身发一封测试邮件，收到即通道就绪。服务器启动时日志也会打印当前启用的适配器（`[MailAdapter:smtp]` / `[MailAdapter:console]`）。

> 安全纪律：授权码只存 `.env`（已被 `.gitignore` 忽略），绝不提交代码库；`.env.example` 只保留占位值。发送失败会向用户明确报错，绝不静默丢码。

### 3.4 HTTPS 与反向代理（Nginx）

应用自身已输出基础安全响应头（`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`）。生产建议再套一层 Nginx 做 TLS 终止：

```nginx
server {
    listen 443 ssl http2;
    server_name workbench.example.com;

    ssl_certificate     /etc/letsencrypt/live/workbench.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/workbench.example.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
server {
    listen 80;
    server_name workbench.example.com;
    return 301 https://$host$request_uri;
}
```

证书可用 Let's Encrypt：`certbot --nginx -d workbench.example.com`。同时在防火墙仅放行 80/443（3000 端口与 5432 不要暴露公网）。

> **博客实时评论（SSE）**：评论流端点已自动输出 `X-Accel-Buffering: no`，标准 Nginx 配置（如上）无需额外改动即可正常推送；若自定义了 `proxy_buffering on`，请对该路径单独关闭缓冲。

### 3.5 数据备份与恢复

数据分为两块，**都要备份**：数据库（`pgdata` 卷）与上传文件（`storage` 卷）。

```bash
# ---------- 1) 数据库每日备份 ----------
sudo mkdir -p /var/backups/pwb
# crontab -e 添加（每天 03:00；-T 让 pg_dump 可在 cron 中运行）
0 3 * * * cd /opt/personal-workbench/docker && docker compose exec -T postgres pg_dump -U pwb personal_workbench | gzip > /var/backups/pwb-$(date +\%F).sql.gz
# 保留最近 30 天
5 3 * * * find /var/backups/pwb -name '*.sql.gz' -mtime +30 -delete

# ---------- 2) 上传文件备份（博客图片等）----------
0 4 * * * docker run --rm -v $(basename $(pwd))_storage:/data -v /var/backups/pwb:/backup alpine \
  tar czf /backup/storage-$(date +\%F).tar.gz -C /data .

# ---------- 恢复 ----------
# 恢复数据库
gunzip -c /var/backups/pwb/2026-09-27.sql.gz | docker compose exec -T postgres psql -U pwb -d personal_workbench
# 恢复上传文件
docker run --rm -v $(basename $(pwd))_storage:/data -v /var/backups/pwb:/backup alpine \
  tar xzf /backup/storage-2026-09-27.tar.gz -C /data
docker compose restart app
```

> **异地备份**：服务器磁盘损坏时本地备份同样丢失。建议用 `rclone` / `aws s3 cp` / 云厂商 CLI 每日把 `/var/backups/pwb` 同步到对象存储。
>
> **定期演练**：每季度在一台测试机上完整走一遍恢复流程——**没验证过的备份等于没有备份**。

### 3.6 升级与回滚

```bash
# 升级（迁移在容器启动时自动执行，只追加、已验证）
git pull
cd docker && docker compose up -d --build

# 回滚：切回上一个镜像/提交后重建
git checkout <上一版本tag>
docker compose up -d --build
```

> 生产纪律：升级前先备份；迁移文件只允许追加；`AUTH_SECRET` 一旦使用不可更换（否则全部会话与验证码失效）。

### 3.7 生产环境变量一览

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接串（compose 内自动组装，无需手工填） |
| `AUTH_SECRET` | ✅ | ≥32 字符随机串；用于会话/验证码 HMAC 签名，泄露=全部会话可伪造 |
| `APP_URL` | ✅ | 对外访问地址（https://…），影响链接生成与回调 |
| `POSTGRES_PASSWORD` | ✅ | compose 中 Postgres 容器密码（**务必替换默认值**） |
| `GHCR_OWNER` / `APP_VERSION` | 路线 B 必填 | GHCR 镜像所有者（小写）与镜像版本 tag |
| `LOG_LEVEL` |  | debug / info / warn / error（生产建议 info） |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` |  | 邮件 SMTP（如 smtp.qq.com:465 SSL）；三要素齐备即真实投递，否则验证码打印控制台 |
| `SMTP_USER` / `SMTP_PASS` |  | SMTP 认证（QQ/Foxmail 用「授权码」而非登录密码），只存 .env 绝不入库 |
| `MAIL_FROM` |  | 发件人；留空回退 SMTP_USER（QQ/Foxmail 要求发件人=认证账号） |
| `STORAGE_DRIVER` / `STORAGE_LOCAL_DIR` |  | 存储抽象（local / s3），本期实现本地磁盘适配器（博客图片上传使用） |
| `OG_FONT_PATH` |  | 可选；博客 OG 分享图的中文字体（.ttf）路径，缺省按 simhei / DengB / DengR 自动探测 |
| `BLOG_IMAGE_MAX_SIZE_MB` / `BLOG_USER_QUOTA_MB` |  | 单图上限（默认 5MB）/ 单用户配额（默认 500MB） |
| `BLOG_COMMENT_RATE_LIMIT` / `BLOG_NEW_USER_COOLDOWN_HOURS` |  | 评论限流（默认 10/分钟）/ 新用户冷静期（默认 24 小时进入审核） |
| `TOOL_SERVICE_*` / `CRON_SECRET` |  | 阶段六工具服务接入与定时端点鉴权 |

所有配置由 `src/config/env.ts` 用 Zod 集中校验，缺失或非法时**启动即退出**（快速失败），不会带病运行。

> `docker/.env` 中的变量会被 `docker-compose.yml` 的 `environment` 段引用；**不要**把 `.env` 提交到仓库（`.gitignore` 与 `.dockerignore` 均已排除）。

---

## 常见问题

| 问题 | 处置 |
|------|------|
| **云服务器部署问题** | 见 [3.2e 云服务器故障排查](#32e-云服务器故障排查) 专表 |
| Windows 下 `db:up` initdb 失败 | 脚本已自动镜像二进制到 `%USERPROFILE%\.pwb-pg-bin`；若仍失败确认该目录可写 |
| 端口 5433 / 3000 被占用 | 数据库：`DEV_DB_PORT=5434 npm run db:up` 并同步 `.env`；应用：`npm run dev -- -p 3001` |
| 集成测试报「测试库不可用」 | 先 `npm run db:up`（自动创建 `personal_workbench_test` 并同步 schema） |
| 主题切换没有扩散动画 | 浏览器不支持 View Transitions 或系统开启「减少动态效果」，自动降级为瞬时切换 |
| 登录提示「邮箱/用户名或密码错误」 | 有意统一文案（防账号枚举），请核对凭据 |
| 收不到验证码 | ① 检查垃圾邮件箱；② 确认服务器已配置 SMTP 三要素（见 3.3，可用 `node scripts/smtp-verify.mjs` 验证通道）；③ 未配置时验证码降级打印在服务端日志 |
| 登录后跳回登录页 | 检查 `AUTH_SECRET` 是否与发会话时一致（更换后旧会话全部失效） |
| 博客 OG 分享图中文显示为方框 | 容器/机器缺中文字体：安装 simhei 或通过 `OG_FONT_PATH` 指定任一 .ttf（不支持 .ttc） |
| 搜索无结果 | 搜索至少输入 2 个字符；确认文章已被管理员审核发布（草稿与待审不进搜索） |
| `npm run lint` 输出上万条告警 | 已在 v0.1.0 修复（忽略 `.next-*` 构建目录）；若仍出现请确认 `eslint.config.mjs` 含 `.next-*/**` 忽略项 |

## 许可证

MIT
