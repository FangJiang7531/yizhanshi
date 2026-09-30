import { readFile } from "node:fs/promises";

/**
 * OG 动态图的中文字体加载（PRD §5.9：动态生成基于标题+作者+主题色）。
 *
 * 背景：next/og（satori）内置字体只覆盖拉丁字形，中文标题会渲染成空框。
 * 解决：运行时读取一个系统 CJK 字体文件注入。探测顺序：
 * 1. `OG_FONT_PATH` 环境变量（部署方显式指定，Linux 服务器走这里）；
 * 2. Windows 常见单文件 TTF（simhei 黑体 / Deng 等线——**不能**用 .ttc，
 *    satori 不支持 TrueType Collection）。
 *
 * 找不到时返回 null：OG 图仍会生成，但中文标题会缺字形——这是可接受的
 * 降级（OG 图本身是 ogImage→coverImage 之后的第三级回退，命中概率低），
 * 不值得为此捆绑十几 MB 字体进仓库。
 *
 * 字体文件 ~10MB，模块级缓存：进程生命周期内只读一次磁盘。
 */
const CANDIDATES: (string | undefined)[] = [
  process.env.OG_FONT_PATH,
  "C:/Windows/Fonts/simhei.ttf",
  "C:/Windows/Fonts/Deng.ttf",
];

let cached: ArrayBuffer | null | undefined;

export async function loadOgFont(): Promise<ArrayBuffer | null> {
  if (cached !== undefined) return cached;

  for (const path of CANDIDATES) {
    if (!path) continue;
    try {
      const buf = await readFile(path);
      // Buffer → 独立 ArrayBuffer（satori 的 data 参数类型要求）
      cached = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      return cached;
    } catch {
      // 探测下一个候选路径
    }
  }

  cached = null;
  return null;
}
