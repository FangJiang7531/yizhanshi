import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  assertDecodableImage,
  contentHash,
  detectImageMime,
  extensionFor,
  processImage,
} from "@/modules/blog/lib/image";

/**
 * 图片处理单元测试（Gate 4.2 / B-15）。
 *
 * sharp 是原生模块，这里真实调用它而不是 mock —— 魔数识别、EXIF 剥离这类行为
 * 一旦被 mock 就失去了验证意义。
 */

/** 生成一张纯色 PNG */
async function makePng(width = 80, height = 60): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// 测试夹具：手工拼装带 GPS IFD 的 EXIF
//
// 为什么不用 sharp 的 withExif()：libvips 只把值写进 IFD0 / IFD1，
// 对 `exif-gps-*` 是**静默丢弃**（实测既不生成 GPS IFD 指针，也不写入坐标值）。
// 而 B-15 要防的恰恰是手机照片的 GPS 定位泄露，所以这里按 TIFF/EXIF 规范手工
// 拼一个真实可解析的 GPS IFD，再由下面的"前置确认"断言它确实进了文件。
// ---------------------------------------------------------------------------

/** TIFF 目录项（12 字节）所引用的数据 */
type ExifEntry = {
  tag: number;
  /** TIFF 数据类型：2=ASCII / 4=LONG / 5=RATIONAL */
  type: number;
  count: number;
  data: Buffer;
  /** 序列化时回填的数据区偏移；数据 ≤ 4 字节时为 -1（直接内联在目录项里） */
  offset: number;
};

const ASCII_TYPE = 2;
const LONG_TYPE = 4;
const RATIONAL_TYPE = 5;
/** 值 ≤ 4 字节的条目直接内联，不需要数据区 */
const INLINE_LIMIT = 4;

function asciiEntry(tag: number, value: string): ExifEntry {
  const data = Buffer.from(`${value}\0`, "latin1");
  return { tag, type: ASCII_TYPE, count: data.length, data, offset: -1 };
}

function longEntry(tag: number, value: number): ExifEntry {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(value, 0);
  return { tag, type: LONG_TYPE, count: 1, data, offset: -1 };
}

function rationalEntry(tag: number, pairs: readonly (readonly [number, number])[]): ExifEntry {
  const data = Buffer.alloc(pairs.length * 8);
  pairs.forEach(([numerator, denominator], i) => {
    data.writeUInt32LE(numerator, i * 8);
    data.writeUInt32LE(denominator, i * 8 + 4);
  });
  return { tag, type: RATIONAL_TYPE, count: pairs.length, data, offset: -1 };
}

/** 序列化一个 IFD：2 字节条目数 + n×12 字节条目 + 4 字节 nextIFD 偏移 */
function serializeIfd(entries: readonly ExifEntry[]): Buffer {
  const buf = Buffer.alloc(2 + entries.length * 12 + 4);
  buf.writeUInt16LE(entries.length, 0);
  entries.forEach((entry, i) => {
    const at = 2 + i * 12;
    buf.writeUInt16LE(entry.tag, at);
    buf.writeUInt16LE(entry.type, at + 2);
    buf.writeUInt32LE(entry.count, at + 4);
    if (entry.offset < 0) entry.data.copy(buf, at + 8);
    else buf.writeUInt32LE(entry.offset, at + 8);
  });
  buf.writeUInt32LE(0, 2 + entries.length * 12); // nextIFD = 0（只有一个 IFD 链）
  return buf;
}

/** 给超过 4 字节的条目的数据区分配偏移（TIFF 要求偶数对齐），返回数据区结束位置 */
function layOutData(entries: readonly ExifEntry[], start: number): number {
  let cursor = start + (start % 2);
  for (const entry of entries) {
    if (entry.data.length <= INLINE_LIMIT) continue;
    entry.offset = cursor;
    cursor += entry.data.length;
    if (cursor % 2 === 1) cursor += 1;
  }
  return cursor;
}

/**
 * 夹具里用到的 EXIF 载荷。
 *
 * 这些字符串既是"隐私内容"，也是断言用的标记 —— 它们都是 ASCII 类型，
 * 会以明文出现在文件字节里，因此断言 `not.toContain(...)` 是真检查而非走过场。
 */
const EXIF_FIXTURE = {
  /** IFD0 的 ImageDescription，模拟相册软件写入的说明 */
  description: "PHONE-PHOTO-MARKER",
  /** IFD0 的 Model —— 设备指纹 */
  deviceModel: "TestCam 1.0",
  /** IFD0 的 Software —— 设备指纹 */
  software: "TestCamOS 3.1",
  /** GPS IFD 的 GPSDateStamp —— 定位信息（ASCII，会明文落盘） */
  gpsDateStamp: "2026:09:30",
  /** GPS IFD 的 GPSLatitude 原始 RATIONAL 字节：39/1, 54/1, 0/1（北纬 39°54'） */
  gpsLatitudeBytes: Buffer.from("270000000100000036000000010000000000000001000000", "hex"),
} as const;

/** 构造 APP1(Exif) 段：IFD0（设备信息）+ GPS IFD（定位信息） */
function buildExifApp1(): Buffer {
  const GPS_POINTER_TAG = 0x8825;
  const IFD0_OFFSET = 8; // TIFF header 占 8 字节，IFD0 紧随其后

  const gpsPointer = longEntry(GPS_POINTER_TAG, 0);
  const ifd0: ExifEntry[] = [
    asciiEntry(0x010e, EXIF_FIXTURE.description), // ImageDescription
    asciiEntry(0x0110, EXIF_FIXTURE.deviceModel), // Model
    asciiEntry(0x0131, EXIF_FIXTURE.software), // Software
    gpsPointer, // GPSInfoIFDPointer（偏移下方回填）
  ];
  const gps: ExifEntry[] = [
    asciiEntry(0x0001, "N"), // GPSLatitudeRef
    rationalEntry(0x0002, [
      [39, 1],
      [54, 1],
      [0, 1],
    ]), // GPSLatitude
    asciiEntry(0x0003, "E"), // GPSLongitudeRef
    rationalEntry(0x0004, [
      [116, 1],
      [23, 1],
      [0, 1],
    ]), // GPSLongitude
    asciiEntry(0x001d, EXIF_FIXTURE.gpsDateStamp), // GPSDateStamp
  ];

  const GPS_OFFSET = IFD0_OFFSET + 2 + ifd0.length * 12 + 4;
  const dataStart = GPS_OFFSET + 2 + gps.length * 12 + 4;

  const all = [...ifd0, ...gps];
  const dataEnd = layOutData(all, dataStart);
  // GPS 指针的值是相对 TIFF header 起点的绝对偏移
  gpsPointer.data.writeUInt32LE(GPS_OFFSET, 0);

  const dataArea = Buffer.alloc(dataEnd - dataStart);
  for (const entry of all) {
    if (entry.offset >= 0) entry.data.copy(dataArea, entry.offset - dataStart);
  }

  const header = Buffer.alloc(8);
  header.write("II", 0, "latin1"); // 小端序
  header.writeUInt16LE(42, 2); // TIFF 魔数
  header.writeUInt32LE(IFD0_OFFSET, 4);

  const exifBlob = Buffer.concat([
    Buffer.from("Exif\0\0", "latin1"),
    header,
    serializeIfd(ifd0),
    serializeIfd(gps),
    dataArea,
  ]);

  const length = Buffer.alloc(2);
  length.writeUInt16BE(exifBlob.length + 2, 0); // APP1 长度含自身 2 字节
  return Buffer.concat([Buffer.from([0xff, 0xe1]), length, exifBlob]);
}

/** 生成一张带 GPS EXIF 的 JPEG —— 模拟手机直出的照片 */
async function makePhonePhotoJpeg(width = 80, height = 60): Promise<Buffer> {
  const plain = await sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 120, b: 200 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  // APP1 段紧跟在 SOI(FFD8) 之后 —— 与相机直出 JPEG 的布局一致
  return Buffer.concat([plain.subarray(0, 2), buildExifApp1(), plain.subarray(2)]);
}

async function makeGif(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 40, channels: 3, background: "green" } })
    .gif()
    .toBuffer();
}

async function makeWebp(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 40, channels: 3, background: "blue" } })
    .webp()
    .toBuffer();
}

describe("detectImageMime（按文件头判定，不信任扩展名）", () => {
  it("正确识别 JPEG / PNG / GIF / WebP", async () => {
    expect(detectImageMime(await makePhonePhotoJpeg())).toBe("image/jpeg");
    expect(detectImageMime(await makePng())).toBe("image/png");
    expect(detectImageMime(await makeGif())).toBe("image/gif");
    expect(detectImageMime(await makeWebp())).toBe("image/webp");
  });

  it("SVG 被识别为非受支持类型（C-07 核心用例）", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(detectImageMime(svg)).toBeNull();
  });

  it("文本 / HTML / 空内容 / 过短内容都被拒", () => {
    expect(detectImageMime(Buffer.from("hello world, this is not an image"))).toBeNull();
    expect(detectImageMime(Buffer.from("<html><body>x</body></html>"))).toBeNull();
    expect(detectImageMime(Buffer.alloc(0))).toBeNull();
    expect(detectImageMime(Buffer.from([0xff, 0xd8]))).toBeNull(); // 只有 2 字节，不足判定长度
  });

  it("PDF 头被拒", () => {
    expect(detectImageMime(Buffer.from("%PDF-1.7\n..."))).toBeNull();
  });

  it("extensionFor 给出正确扩展名", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/webp")).toBe("webp");
    expect(extensionFor("image/gif")).toBe("gif");
  });
});

describe("contentHash（哈希去重的键）", () => {
  it("相同内容哈希一致、不同内容哈希不同", async () => {
    const a1 = await makePng(80, 60);
    const a2 = await makePng(80, 60);
    const b = await makePng(81, 60);

    expect(contentHash(a1)).toBe(contentHash(a2));
    expect(contentHash(a1)).not.toBe(contentHash(b));
    expect(contentHash(a1)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("processImage（EXIF 剥离 / 缩放 / WebP / 缩略图）", () => {
  it("B-15：带 GPS 的手机照片处理后被彻底剥离 EXIF / ICC", async () => {
    const input = await makePhonePhotoJpeg();

    // —— 前置确认：输入必须真的带 EXIF，且 GPS IFD 里必须有定位数据 ——
    // 少了这一步，后面的"不含 EXIF"就可能是假绿（夹具压根没写进 EXIF）。
    const inputExif = (await sharp(input).metadata()).exif;
    expect(inputExif).toBeDefined();
    const inputBlob = inputExif as Buffer;
    expect(inputBlob.toString("latin1")).toContain(EXIF_FIXTURE.description);
    expect(inputBlob.toString("latin1")).toContain(EXIF_FIXTURE.deviceModel);
    expect(inputBlob.toString("latin1")).toContain(EXIF_FIXTURE.software);
    expect(inputBlob.toString("latin1")).toContain(EXIF_FIXTURE.gpsDateStamp);
    // GPS 坐标是 RATIONAL（二进制），按原始字节校验：39/1、54/1、0/1
    expect(inputBlob.includes(EXIF_FIXTURE.gpsLatitudeBytes)).toBe(true);

    const out = await processImage(input);

    const mainMeta = await sharp(out.main).metadata();
    expect(mainMeta.format).toBe("webp");
    expect(mainMeta.exif).toBeUndefined();
    expect(mainMeta.icc).toBeUndefined();
    expect((await sharp(out.thumb).metadata()).exif).toBeUndefined();

    // 输出字节里也不应残留任何 EXIF 标记串
    const mainLatin = out.main.toString("latin1");
    expect(mainLatin).not.toContain(EXIF_FIXTURE.description);
    expect(mainLatin).not.toContain(EXIF_FIXTURE.deviceModel);
    expect(mainLatin).not.toContain(EXIF_FIXTURE.software);
    expect(mainLatin).not.toContain(EXIF_FIXTURE.gpsDateStamp);
  });

  it("主图最长边被限制到 maxDimension，缩略图为 400px 以内", async () => {
    const big = await sharp({
      create: { width: 1200, height: 3000, channels: 3, background: "black" },
    })
      .png()
      .toBuffer();

    const out = await processImage(big, { maxDimension: 2000, thumbDimension: 400 });
    const mainMeta = await sharp(out.main).metadata();
    const thumbMeta = await sharp(out.thumb).metadata();

    expect(Math.max(mainMeta.width ?? 0, mainMeta.height ?? 0)).toBe(2000);
    expect(Math.max(thumbMeta.width ?? 0, thumbMeta.height ?? 0)).toBe(400);
    // 纵横比保持：原图 1200×3000 → 最长边收到 2000 → 800×2000
    expect(out.width).toBe(800);
    expect(out.height).toBe(2000);
  });

  it("小图不会被放大（withoutEnlargement）", async () => {
    const small = await makePng(50, 50);
    const out = await processImage(small, { maxDimension: 2000 });
    expect(out.width).toBe(50);
    expect(out.height).toBe(50);
  });

  it("输出统一为 WebP，且 size 与主图字节数一致", async () => {
    const out = await processImage(await makePng());
    expect((await sharp(out.main).metadata()).format).toBe("webp");
    expect((await sharp(out.thumb).metadata()).format).toBe("webp");
    expect(out.size).toBe(out.main.byteLength);
    expect(out.hash).toBe(contentHash(await makePng()));
  });

  it("透明 PNG 的 alpha 通道被保留", async () => {
    const transparent = await sharp({
      create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const out = await processImage(transparent);
    expect((await sharp(out.main).metadata()).hasAlpha).toBe(true);
  });
});

describe("assertDecodableImage（魔数 + 可解码性双重校验）", () => {
  it("真实图片通过", async () => {
    await expect(assertDecodableImage(await makePng())).resolves.toBe("image/png");
  });

  it("伪造的文件头（有魔数但内容损坏）被拒", async () => {
    // 正确的 PNG 魔数 + 垃圾数据
    const fake = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("this is not really a png body at all, just text".repeat(3)),
    ]);
    await expect(assertDecodableImage(fake)).rejects.toThrow("CORRUPT_IMAGE");
  });

  it("非图片被拒（UNSUPPORTED_IMAGE）", async () => {
    await expect(assertDecodableImage(Buffer.from("plain text"))).rejects.toThrow("UNSUPPORTED_IMAGE");
  });
});
