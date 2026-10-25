#!/usr/bin/env node
/**
 * APK 构建脚本（无 Gradle，纯 Android 原生工具链）。
 *
 * Windows aapt2 不支持含中文的路径——本脚本自动用 subst 虚拟盘符
 * 把项目映射为 ASCII 路径再构建，产物与密钥最终写回真实目录。
 *
 * 用法：node build.mjs
 * 产物：dist/个人数字工作台-v1.0.0.apk
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { resolve, join } from "node:path";
import { exit } from "node:process";

/** 真实项目根（可能含中文） */
const ROOT = resolve(import.meta.dirname ?? ".");
const BUILD_DIR_REAL = join(ROOT, "build");
const DIST_REAL = join(ROOT, "dist");
const KEYSTORE_REAL_DIR = join(ROOT, "keystore");

const VERSION_NAME = "1.1.0";
const VERSION_CODE = "2";
const APK_NAME = `个人数字工作台-v${VERSION_NAME}.apk`;

// ---------- subst：找/建 ASCII 盘符 ----------
function ensureSubstDrive() {
  function mapsToApp(d) {
    // 不比较路径字符串（cmd 中文输出编码不可靠），用工程特征文件判定
    return existsSync(`${d}:\\build.mjs`) && existsSync(`${d}:\\app\\AndroidManifest.xml`);
  }
  const listing = (spawnSync("cmd.exe", ["/c", "subst"], { encoding: "utf8" }).stdout || "").trim();
  const used = new Set(
    listing
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => /^[A-Z]:/.exec(l)?.[0]?.[0]),
  );
  // 复用已映射到本工程的盘符
  for (const d of ["X", "Y", "W", "V", "U", "T"]) {
    if (mapsToApp(d)) return `${d}:\\`;
  }
  // 新建
  for (const d of ["X", "Y", "W", "V", "U", "T"]) {
    if (used.has(d)) continue;
    if (existsSync(`${d}:\\`)) continue; // 真实卷
    const r = spawnSync("cmd.exe", ["/c", "subst", `${d}:`, ROOT], { encoding: "utf8" });
    if (r.status === 0 && mapsToApp(d)) return `${d}:\\`;
  }
  return null;
}
const PROOT = ensureSubstDrive();
if (!PROOT) {
  console.error("✗ 无法创建 ASCII 虚拟盘符（X/Y/W/V/U 均不可用）");
  exit(1);
}
console.log(`▶ 虚拟盘符：${ROOT} → ${PROOT}`);

// 构建期全部使用 ASCII 路径
const BT = join(PROOT, "sdk", "build-tools", "34.0.0");
const JAR = join(PROOT, "sdk", "platforms", "android-34", "android.jar");
const APP = join(PROOT, "app");
const BUILD = join(PROOT, "build");
const DIST = join(PROOT, "dist");
const KEYSTORE_DIR = join(PROOT, "keystore");
const KEYSTORE = join(KEYSTORE_DIR, "pwb-release.keystore");
const KEY_INFO = join(KEYSTORE_DIR, "密钥信息.txt");
const APK_OUT = join(DIST, APK_NAME);

/** 构建工具链统一使用本地 JDK17（R8 8.2 与 JDK25 类文件解析不兼容） */
const JDK17 = join(PROOT, "jdk", "jdk-17.0.2");
const TOOL_ENV = existsSync(join(JDK17, "bin", "java.exe"))
  ? { ...process.env, JAVA_HOME: JDK17 }
  : process.env;

/** .exe 直调（javac/jar/keytool 走 JDK17） */
function sh(cmd, args, opts = {}) {
  const realCmd = ["javac", "jar", "keytool"].includes(cmd) ? join(JDK17, "bin", `${cmd}.exe`) : cmd;
  const r = spawnSync(realCmd, args, { encoding: "utf8", cwd: PROOT, env: TOOL_ENV, ...opts });
  if (r.status !== 0) {
    console.error(`✗ 命令失败（${r.status}）：${realCmd}\n${(r.stdout || "") + (r.stderr || "")}`);
    exit(1);
  }
  return r;
}
/** .bat 工具经 cmd 调用（JAVA_HOME 指向 JDK17） */
function bat(name, args) {
  const r = spawnSync("cmd.exe", ["/c", join(BT, name), ...args], { encoding: "utf8", cwd: PROOT, env: TOOL_ENV });
  if (r.status !== 0) {
    console.error(`✗ ${name} 失败（${r.status}）\n${(r.stdout || "") + (r.stderr || "")}`);
    exit(1);
  }
  return r;
}
const log = (s) => console.log(`▶ ${s}`);

// ---------- 0. 前置 ----------
for (const f of [join(BT, "aapt2.exe"), join(BT, "zipalign.exe"), JAR]) {
  if (!existsSync(f)) {
    console.error(`✗ 缺少 SDK 组件：${f}（见 README.md）`);
    exit(1);
  }
}
rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });
mkdirSync(DIST, { recursive: true });
mkdirSync(KEYSTORE_DIR, { recursive: true });
// 真实目录里已有密钥则带入虚拟盘（增量构建保留同一签名）
if (existsSync(join(KEYSTORE_REAL_DIR, "pwb-release.keystore")) && !existsSync(KEYSTORE)) {
  copyFileSync(join(KEYSTORE_REAL_DIR, "pwb-release.keystore"), KEYSTORE);
}

// ---------- 1-2. aapt2 ----------
log("编译资源 (aapt2 compile)");
sh(join(BT, "aapt2.exe"), ["compile", "--dir", join(APP, "res"), "-o", join(BUILD, "res.zip")]);

log("链接资源 (aapt2 link)");
sh(join(BT, "aapt2.exe"), [
  "link",
  "-o", join(BUILD, "base.apk"),
  "-I", JAR,
  "--manifest", join(APP, "AndroidManifest.xml"),
  "-A", join(APP, "assets"),
  "--java", join(BUILD, "gen"),
  "--min-sdk-version", "24",
  "--target-sdk-version", "34",
  "--version-code", VERSION_CODE,
  "--version-name", VERSION_NAME,
  "--auto-add-overlay",
  join(BUILD, "res.zip"),
]);

// ---------- 3. javac ----------
log("编译 Java (javac, target 11)");
const sources = [...collect(join(APP, "java"), ".java"), ...collect(join(BUILD, "gen"), ".java")];
sh("javac", ["--release", "11", "-encoding", "UTF-8", "-nowarn", "-cp", JAR, "-d", join(BUILD, "classes"), ...sources]);

// ---------- 4. d8 ----------
log("生成 classes.dex (d8)");
// d8 对散装 .class 输入存在路径解析 NPE（Windows），统一先打 jar 再转 dex
sh("jar", ["--create", "--file", join(BUILD, "classes.jar"), "-C", join(BUILD, "classes"), "."]);
bat("d8.bat", ["--release", "--lib", JAR, "--min-api", "24", "--output", BUILD, join(BUILD, "classes.jar")]);

// ---------- 5. 组包 ----------
log("打包未签名 APK");
const unsigned = join(BUILD, "unsigned.apk");
copyFileSync(join(BUILD, "base.apk"), unsigned);
appendZipEntry(unsigned, join(BUILD, "classes.dex"), "classes.dex");

// ---------- 6. zipalign ----------
log("字节对齐 (zipalign)");
const aligned = join(BUILD, "aligned.apk");
sh(join(BT, "zipalign.exe"), ["-f", "4", unsigned, aligned]);

// ---------- 7. 密钥（首次生成）----------
if (!existsSync(KEYSTORE)) {
  log("生成签名密钥 (keytool, RSA-2048, 30 年)");
  const password = randomBytes(15).toString("base64url");
  sh("keytool", [
    "-genkeypair", "-v",
    "-keystore", KEYSTORE,
    "-alias", "pwb",
    "-keyalg", "RSA",
    "-keysize", "2048",
    "-sigalg", "SHA256withRSA",
    "-validity", "10950",
    "-storepass", password,
    "-keypass", password,
    "-dname", "CN=KC Forge, OU=PersonalWorkbench, O=KCForge, L=Beijing, C=CN",
  ]);
  writeFileSync(
    KEY_INFO,
    [
      "══════════════════════════════════════════════════════",
      " 应用签名密钥（务必妥善保管，切勿上传网络/仓库）",
      "══════════════════════════════════════════════════════",
      `密钥文件：pwb-release.keystore`,
      `别名（alias）：pwb`,
      `密钥库口令：${password}`,
      `密钥口令：${password}`,
      `算法：RSA 2048 / SHA256withRSA / 有效期 30 年`,
      "",
      "⚠ 丢失该密钥将无法发布同签名升级版（只能换包名重装），",
      "   请把 keystore/ 整个目录备份到安全位置。",
      "══════════════════════════════════════════════════════",
    ].join("\n"),
    "utf8",
  );
  console.log("  密钥口令已写入 keystore/密钥信息.txt");
}
const pass = readFileSync(KEY_INFO, "utf8").match(/密钥库口令：(.+)/)?.[1]?.trim();
if (!pass) {
  console.error("✗ 无法解析密钥口令");
  exit(1);
}

// ---------- 8. 签名 ----------
log("签名 APK (apksigner, v1+v2+v3)");
bat("apksigner.bat", [
  "sign",
  "--ks", KEYSTORE,
  "--ks-key-alias", "pwb",
  "--ks-pass", `pass:${pass}`,
  "--key-pass", `pass:${pass}`,
  "--v1-signing-enabled", "true",
  "--v2-signing-enabled", "true",
  "--v3-signing-enabled", "true",
  "--out", APK_OUT,
  aligned,
]);

// ---------- 9. 验证 ----------
log("验证签名 (apksigner verify)");
const verify = bat("apksigner.bat", ["verify", "--print-certs", APK_OUT]);
console.log(
  verify.stdout
    .split("\n")
    .filter((l) => l.includes("Signer") || l.includes("SHA-256"))
    .map((l) => "  " + l.trim())
    .join("\n"),
);

// ---------- 10. 产物回写真实目录 ----------
mkdirSync(DIST_REAL, { recursive: true });
mkdirSync(KEYSTORE_REAL_DIR, { recursive: true });
copyFileSync(APK_OUT, join(DIST_REAL, APK_NAME));
for (const f of readdirSync(KEYSTORE_DIR)) {
  copyFileSync(join(KEYSTORE_DIR, f), join(KEYSTORE_REAL_DIR, f));
}

const size = (statSync(APK_OUT).size / 1024 / 1024).toFixed(2);
const sha256 = createHash("sha256").update(readFileSync(APK_OUT)).digest("hex");
console.log("\n✅ 构建完成");
console.log(`   产物：${join(DIST_REAL, APK_NAME)}`);
console.log(`   大小：${size} MB`);
console.log(`   SHA-256：${sha256}`);

// ---------- 工具 ----------
function collect(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) collect(p, ext, out);
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}
function appendZipEntry(zipPath, filePath, entryName) {
  const py = spawnSync("python", [
    "-c",
    [
      "import zipfile",
      `src=r"${filePath.replace(/\\/g, "\\\\")}"`,
      `zp=r"${zipPath.replace(/\\/g, "\\\\")}"`,
      "zf=zipfile.ZipFile(zp,'a',zipfile.ZIP_DEFLATED)",
      `zf.write(src,${JSON.stringify(entryName)})`,
      "zf.close()",
    ].join(";"),
  ]);
  if (py.status !== 0) {
    console.error("✗ 打包 classes.dex 失败\n" + (py.stdout || "") + (py.stderr || ""));
    exit(1);
  }
}
