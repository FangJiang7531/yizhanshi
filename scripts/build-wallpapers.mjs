/**
 * 壁纸压缩：PC（横版）与手机（竖版）壁纸 → public/wallpaper/
 * 用法：node scripts/build-wallpapers.mjs <pcPng> <mobilePng>
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const [pc, mobile] = process.argv.slice(2);
if (!pc || !mobile) {
  console.error("用法：node scripts/build-wallpapers.mjs <pcPng> <mobilePng>");
  process.exit(1);
}

const dir = resolve(process.cwd(), "public", "wallpaper");
mkdirSync(dir, { recursive: true });

await sharp(pc)
  .resize({ width: 1920, withoutEnlargement: true })
  .jpeg({ quality: 78, mozjpeg: true })
  .toFile(resolve(dir, "wave-pc.jpg"));
console.log("public/wallpaper/wave-pc.jpg");

await sharp(mobile)
  .resize({ width: 1080, withoutEnlargement: true })
  .jpeg({ quality: 78, mozjpeg: true })
  .toFile(resolve(dir, "wave-mobile.jpg"));
console.log("public/wallpaper/wave-mobile.jpg");
