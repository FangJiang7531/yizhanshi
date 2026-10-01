/**
 * 验证用例：Docker 部署链路静态一致性核验（P1 / P2）
 *
 * 起因：entrypoint.sh 用 `require('pg')` 探活数据库，但 runner 阶段未提供 pg。
 * 本用例以「静态断言」的方式将部署链路的隐含契约固化为回归测试，避免再次退化。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("docker 部署链路一致性", () => {
  it("entrypoint.sh 探活所依赖的模块必须能在 runner 阶段解析", () => {
    const entry = read("docker/entrypoint.sh");
    const dockerfile = read("docker/Dockerfile");
    const pkg = JSON.parse(read("package.json"));

    // 提取 entrypoint 中 require(...) 的模块名
    const requires = [...entry.matchAll(/require\(['"]([^'"./][^'"]*)['"]\)/g)]
      .map((m) => m[1])
      .filter((v): v is string => typeof v === "string");
    // 取包名根（@scope/name 或 name）
    const pkgs = [
      ...new Set(
        requires.map((r: string) => (r.startsWith("@") ? r.split("/").slice(0, 2).join("/") : r.split("/")[0]!)),
      ),
    ];

    expect(pkgs.length).toBeGreaterThan(0);

    for (const p of pkgs) {
      const inDeps = Boolean((pkg.dependencies as Record<string, string> | undefined)?.[p]);
      const copiedInDockerfile = new RegExp(`COPY[^\\n]*node_modules/${p.replace("/", "\\/")}`).test(dockerfile);
      // 要么声明为生产依赖且被 COPY，要么至少被 Dockerfile 显式 COPY
      expect(
        inDeps || copiedInDockerfile,
        `entrypoint require('${p}')，但既未声明为 dependencies 也未在 Dockerfile 中 COPY 到 runner`,
      ).toBe(true);
    }
  });

  it("runner 阶段必须复制 prisma CLI（entrypoint 执行 migrate deploy）", () => {
    const entry = read("docker/entrypoint.sh");
    const dockerfile = read("docker/Dockerfile");
    if (entry.includes("prisma migrate deploy")) {
      expect(dockerfile).toMatch(/COPY[^\n]*node_modules\/prisma/);
      expect(dockerfile).toMatch(/COPY[^\n]*node_modules\/\.bin/);
    }
  });

  it("CI 推送的镜像地址必须与 compose 拉取地址同构", () => {
    const ci = read(".github/workflows/release.yml");
    // CI 期望：ghcr.io/${{ github.repository_owner }}/personal-workbench:<tag>
    const ciTag = ci.match(/ghcr\.io\/\$\{\{ github\.repository_owner \}\}\/([\w-]+):/);
    expect(ciTag, "release.yml 未使用 repository_owner 或未找到镜像 tag").toBeTruthy();
    const ciImageName = ciTag![1]!;

    // 反向断言：不允许出现 github.repository（会得到 <owner>/<repo>/<image> 两级路径）
    expect(ci).not.toMatch(/ghcr\.io\/\$\{\{ github\.repository \}\}/);

    for (const composeFile of ["docker/docker-compose.prod.yml", "docker/docker-compose.yml"]) {
      const compose = read(composeFile);
      const m = compose.match(/image:\s*ghcr\.io\/([^\s:]+)\/([\w-]+)/);
      if (!m) continue;
      const pathSegs = (m[1] ?? "").split("/");
      // compose 期望 <owner>/<image>（一段 owner 路径）
      expect(
        pathSegs.length,
        `${composeFile} 的 image 路径段数(${pathSegs.length}) 与 release.yml 不一致：${m[0]}`,
      ).toBe(1);
      expect(m[2]).toBe(ciImageName);
    }
  });

  it("仓库根目录应提供 .dockerignore（避免 .next/node_modules/.env 进入构建上下文）", () => {
    expect(existsSync(resolve(root, ".dockerignore"))).toBe(true);
  });
});

describe("工具链配置健壮性", () => {
  it("ESLint 必须忽略所有构建产物目录变体，否则 lint 门禁会被噪声淹没", () => {
    const cfg = read("eslint.config.mjs");
    // .next 本身
    expect(cfg).toMatch(/["']\.next\/\*\*["']/);
    // NEXT_DIST_DIR 产生的变体（.next-verify / .next-e2e / .next-stale-manual …）
    expect(cfg).toMatch(/["']\.next-\*\/\*\*["']/);
  });

  it("gitignore 应忽略全部 NEXT_DIST_DIR 构建变体", () => {
    const gi = read(".gitignore");
    expect(gi).toMatch(/\.next-/);
  });
});
