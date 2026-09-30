import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { randomFillSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { LocalDiskAdapter } from "@/lib/storage";
import { createBlogImageService } from "@/modules/blog/services/image.service";
import { parseStorageUrl, signStorageKey, verifyStorageKeySignature } from "@/modules/blog/lib/signed-url";
import { env } from "@/config/env";

/**
 * 图片服务集成测试（Gate 4.2）。
 *
 * 用真实本地磁盘适配器（临时目录），而不是 mock ——
 * 配额统计、去重、发布固化（复制文件 + 重写 URL）这些行为只有在真实 I/O 下才有意义。
 */
let root: string;
let adapter: LocalDiskAdapter;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "pwb-blog-img-"));
  adapter = new LocalDiskAdapter(root);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const USER = "ckzzzzzzzzzzzzzzzzzzzzzzzz";

async function makePng(width = 40, height = 40): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png()
    .toBuffer();
}

/** 生成一张体积可控的随机噪声 JPEG（用于大小/配额测试）
 *  注意：sharp 的 create 不支持 noise 选项，必须喂随机原始像素才压不下去。 */
async function makeLargeJpeg(minBytes: number): Promise<Buffer> {
  const side = Math.ceil(Math.sqrt(minBytes / 3)) + 200;
  const raw = Buffer.alloc(side * side * 3);
  randomFillSync(raw);
  return sharp(raw, { raw: { width: side, height: side, channels: 3 } })
    .jpeg({ quality: 100 })
    .toBuffer();
}

describe("Gate 4.2 · 上传与存储", () => {
  it("上传成功：返回草稿签名 URL、缩略图、尺寸与体积", async () => {
    const service = createBlogImageService({ storage: adapter });
    const result = await service.upload({ userId: USER, buffer: await makePng(), declaredMime: "image/png" });

    expect(result.width).toBe(40);
    expect(result.height).toBe(40);
    expect(result.deduped).toBe(false);
    expect(result.size).toBeGreaterThan(0);

    // 草稿 URL 必须是签名 URL，而不是公开路径（B-16）
    const main = parseStorageUrl(result.url);
    const thumb = parseStorageUrl(result.thumbUrl);
    expect(main?.key.startsWith(`blog/draft/${USER}/`)).toBe(true);
    expect(main?.key.endsWith(".webp")).toBe(true);
    expect(main?.query).toMatch(/exp=\d+&sig=[0-9a-f]{32}/);
    expect(thumb?.key.endsWith("_thumb.webp")).toBe(true);
  });

  it("同一张图片上传两次命中哈希去重，未产生新文件（B-17）", async () => {
    const service = createBlogImageService({ storage: adapter });
    const buffer = await makePng(60, 60);

    const first = await service.upload({ userId: USER, buffer, declaredMime: "image/png" });
    const second = await service.upload({ userId: USER, buffer, declaredMime: "image/png" });

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    // 哈希一致 → URL 指向同一个键（只是签名可能不同）
    expect(parseStorageUrl(second.url)?.key).toBe(parseStorageUrl(first.url)?.key);
  });

  it("超过大小上限的图片被拒，文案明确（Gate 4.2-2）", async () => {
    const service = createBlogImageService({ storage: adapter, maxSizeMb: 1 });
    const big = await makeLargeJpeg(1.4 * 1024 * 1024);
    expect(big.byteLength).toBeGreaterThan(1024 * 1024);

    await expect(
      service.upload({ userId: USER, buffer: big, declaredMime: "image/jpeg" }),
    ).rejects.toThrow(/不得超过 1MB/);
  });

  it("SVG 伪装成 PNG 被拒（魔数校验，C-07 / Gate 4.2-3）", async () => {
    const service = createBlogImageService({ storage: adapter });
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    await expect(
      service.upload({ userId: USER, buffer: svg, declaredMime: "image/png" }),
    ).rejects.toThrow(/不是有效的图片/);
  });

  it("声明为非法 MIME 直接被拒", async () => {
    const service = createBlogImageService({ storage: adapter });
    await expect(
      service.upload({ userId: USER, buffer: await makePng(), declaredMime: "image/svg+xml" }),
    ).rejects.toThrow(/仅支持/);
  });

  it("空文件被拒", async () => {
    const service = createBlogImageService({ storage: adapter });
    await expect(
      service.upload({ userId: USER, buffer: Buffer.alloc(0), declaredMime: "image/png" }),
    ).rejects.toThrow(/空/);
  });

  it("超出配额被拒（配额按已用空间判断）", async () => {
    const quotaUser = "ckquotaquotaquotaquotaquot";
    // 配额放到极小值，模拟"空间已满"
    const service = createBlogImageService({ storage: adapter, quotaMb: 0.00005, maxSizeMb: 5 });
    const buffer = await makePng(200, 200);

    // 第一次可能刚好放下（用来制造"已有占用"），之后必须被拒
    let rejected = false;
    for (let i = 0; i < 5; i++) {
      try {
        await service.upload({
          userId: quotaUser,
          buffer: Buffer.concat([buffer, Buffer.from(String(i).repeat(200))]),
          declaredMime: "image/png",
        });
      } catch (err) {
        rejected = true;
        expect((err as Error).message).toMatch(/图片空间/);
        break;
      }
    }
    expect(rejected).toBe(true);
  });

  it("usedBytes 统计草稿区与公开区的实际占用", async () => {
    const u = "ckusageusageusageusageus";
    const service = createBlogImageService({ storage: adapter });
    expect(await service.usedBytes(u)).toBe(0);

    const up = await service.upload({ userId: u, buffer: await makePng(100, 100), declaredMime: "image/png" });
    const used = await service.usedBytes(u);
    expect(used).toBeGreaterThan(0);
    // 占用包含主图 + 缩略图，因此必然 ≥ 主图体积
    expect(used).toBeGreaterThanOrEqual(up.size);
  });
});

describe("Gate 4.2 · 发布固化（草稿签名 URL → 公开路径）", () => {
  it("正文中引用的草稿图片被复制到公开区并重写为免签名 URL", async () => {
    const u = "ckpromotepromotepromote1";
    const service = createBlogImageService({ storage: adapter });
    const up = await service.upload({ userId: u, buffer: await makePng(70, 70), declaredMime: "image/png" });

    const contentMd = `正文开始\n\n![图](${up.url})\n\n正文结束`;
    const promoted = await service.promoteForPublish(u, contentMd);

    expect(promoted).not.toContain("/blog/draft/");
    expect(promoted).toContain(`/api/files/blog/pub/${u}/`);
    expect(promoted).not.toContain("sig=");

    // 公开区文件确实存在
    const pubKey = parseStorageUrl(promoted!.match(/\/api\/files\/\S+\.webp/)![0])!.key;
    expect(await adapter.get(pubKey)).not.toBeNull();
    // 草稿区原件保留（其它草稿可能仍引用）
    expect(await adapter.get(parseStorageUrl(up.url)!.key)).not.toBeNull();
  });

  it("未引用草稿图片时原样返回", async () => {
    const service = createBlogImageService({ storage: adapter });
    const md = "只有文字，没有任何图片";
    expect(await service.promoteForPublish(USER, md)).toBe(md);
  });

  it("他人的草稿图片不被固化（跨用户不能借发布把别人的图变公开）", async () => {
    const owner = "ckownerownerownerownerow";
    const attacker = "ckattackattackattackattta";
    const service = createBlogImageService({ storage: adapter });
    const up = await service.upload({ userId: owner, buffer: await makePng(55, 55), declaredMime: "image/png" });

    const promoted = await service.promoteForPublish(attacker, `![x](${up.url})`);
    expect(promoted).toContain("/blog/draft/"); // 未被改写
  });
});

describe("签名 URL（B-16 访问控制）", () => {
  it("正确签名可通过校验，篡改或被截断则失败", () => {
    const key = `blog/draft/${USER}/abc123.webp`;
    const exp = Date.now() + 60_000;
    const sig = signStorageKey(key, exp, env.AUTH_SECRET);

    expect(verifyStorageKeySignature(key, exp, sig, env.AUTH_SECRET)).toBe(true);
    expect(verifyStorageKeySignature(key, exp, sig.slice(0, -1) + "0", env.AUTH_SECRET)).toBe(false);
    expect(verifyStorageKeySignature(key, exp, "", env.AUTH_SECRET)).toBe(false);
    // 换一个 key 用同一签名 → 不通过（签名绑定路径）
    expect(verifyStorageKeySignature(`${key}x`, exp, sig, env.AUTH_SECRET)).toBe(false);
    // 改过期时间 → 不通过（签名绑定 exp）
    expect(verifyStorageKeySignature(key, exp + 1000, sig, env.AUTH_SECRET)).toBe(false);
  });

  it("过期签名被拒", () => {
    const key = `blog/draft/${USER}/abc123.webp`;
    const past = Date.now() - 1000;
    const sig = signStorageKey(key, past, env.AUTH_SECRET);
    expect(verifyStorageKeySignature(key, past, sig, env.AUTH_SECRET)).toBe(false);
  });

  it("换密钥签出的签名不被接受", () => {
    const key = `blog/draft/${USER}/abc123.webp`;
    const exp = Date.now() + 60_000;
    const forged = signStorageKey(key, exp, "another-secret-key-0123456789abcd");
    expect(verifyStorageKeySignature(key, exp, forged, env.AUTH_SECRET)).toBe(false);
  });
});
