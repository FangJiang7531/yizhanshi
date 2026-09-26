# 模块脚手架（_template）

新增业务模块时复制本目录并替换占位名。分层纪律（强约束）：

```
<module>/
├── actions/          # Server Actions（控制器层）：鉴权 → Zod → 服务层 → revalidate
├── services/         # 业务逻辑：不依赖 HTTP 上下文（无 cookies()/headers()），可单测
├── repositories/     # 数据访问（Prisma）：所有查询首参 userId，禁止业务判断
├── schemas/          # Zod Schema：前后端复用，Action 入口必须校验
├── components/       # 模块私有组件
└── types.ts          # 模块 DTO（可序列化，Date 一律转 ISO 字符串）
```

新增板块三步（验证假设 H1）：

1. `src/config/modules.ts` 登记模块元信息（侧边栏/占位页/快捷入口自动生效）；
2. 复制本目录为 `src/modules/<key>/`，按上述分层填充；
3. 在 `src/app/(platform)/<path>/` 建页面，从服务层取数，组装客户端组件。

禁止事项：
- 跨模块直接导入 `repositories/*`（ESLint 已拦截）——只能通过对方 `services` 访问；
- 组件里写死颜色（只能用 `--color-*` 语义变量）；
- 查询漏带 `userId` 作用域。
