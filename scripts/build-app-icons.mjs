/**
 * 应用图标生成：读取原图 → sharp trim 裁剪白边 → 输出多尺寸 favicon/触摸图标。
 * 用法：node scripts/build-app-icons.mjs <sourcePng>
 */
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error("用法：node scripts/build-app-icons.mjs <sourcePng>");
  process.exit(1);
}

const publicDir = resolve(process.cwd(), "public");
mkdirSync(publicDir, { recursive: true });

// trim：裁掉四周白边（阈值 24 容忍近白像素）
const trimmed = sharp(src).trim({ background: "#ffffff", threshold: 24 });

// 主图标：正方形 512（圆角由展示端 CSS 控制，源图已带圆角+透明底）
const base = await trimmed.toBuffer();
const meta = await sharp(base).metadata();
console.log(`裁剪后尺寸：${meta.width}x${meta.height}`);

// 以短边为准居中裁正方形，保证图标不变形
const side = Math.min(meta.width, meta.height);
const square = await sharp(base)
  .extract({
    left: Math.floor((meta.width - side) / 2),
    top: Math.floor((meta.height - side) / 2),
    width: side,
    height: side,
  })
  .toBuffer();

const outputs = [
  { name: "icon-512.png", size: 512 },
  { name: "icon-192.png", size: 192 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-32.png", size: 32 },
  { name: "icon-16.png", size: 16 },
];

for (const { name, size } of outputs) {
  await sharp(square)
    .resize(size, size, { fit: "cover" })
    .png({ quality: 92 })
    .toFile(resolve(publicDir, name));
  console.log(`生成 public/${name} (${size}x${size})`);
}

console.log("完成");
