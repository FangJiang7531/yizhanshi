# 检测期验证用例（2026-09-30 全面检测）

本目录为「全面检测」轮次补充的回归用例，独立于常规 `tests/unit|integration`。
用例设计原则：**自包含**（自行造数与清理，不依赖外部预置数据），可重复运行。

| 文件 | 覆盖范围 | 用例数 |
|------|---------|--------|
| `xss.test.ts` | Markdown / 评论净化管线 XSS 惰性化核验（白名单实体转义） | 13 |
| `isolation.test.ts` | 跨用户越权防护（服务层 userId 作用域，`beforeAll` 自建两用户+任务+习惯） | 9 |
| `docker-probe-repro.test.ts` | 部署链路契约：entrypoint 依赖可达性、prisma CLI 复制、CI/compose 镜像地址同构、`.dockerignore` 存在性 | 4 |

## 运行

```bash
npx vitest run tests/verify
```

## 回归价值

`docker-probe-repro.test.ts` 把 2026-09-30 检测中发现的 P1（entrypoint `require('pg')` 在 runner 阶段不可解析）
与 P2（CI 推送路径与 compose 拉取路径不一致）固化为断言，防止部署链路再次退化。
