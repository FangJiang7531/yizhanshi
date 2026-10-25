# 个人数字工作台 · Android App

> 本目录是 Android 壳应用源码快照（v1.1.0）。
> `sdk/`、`jdk/`、`keystore/`、`dist/` 为本机构建环境与产物，**不入库**；
> 获取构建工具链与签名密钥说明见下文。日常构建请在仓库外的 `APP/` 工作目录进行，
> 或复制本目录后按 README 恢复工具链。

网站 `https://kcforge.cn` 的官方手机客户端（WebView 混合壳），安装即用——
应用内直接注册/登录/使用全部功能（任务、习惯、博客、通知、私信、短链、书签…）。

## 安装包

| 项 | 值 |
|----|----|
| 文件 | `dist/个人数字工作台-v1.0.0.apk` |
| 大小 | 0.29 MB |
| 包名 | `cn.kcforge.workbench` |
| 版本 | 1.0.0 (versionCode 1) |
| 系统 | Android 7.0（API 24）及以上 |
| 权限 | **仅 INTERNET**（无存储/定位/通讯录等任何敏感权限） |
| 签名 | RSA-2048 / SHA256withRSA，APK 签名方案 v2+v3 |
| 图标 | 品牌图完整裁除白边（透明底） |

安装：手机上直接打开 APK → 允许「安装未知来源应用」→ 完成后桌面出现「个人数字工作台」。
首次进入即登录页，可邮箱注册、账号密码登录、访客模式，或 GitHub / Google 第三方登录（OAuth 全程在应用内完成）。

## 安全设计（防入侵基线）

- **域名白名单导航**：仅 `kcforge.cn` 与 OAuth 授权域（github.com / accounts.google.com / oauth2.googleapis.com）在应用内打开；其余一切外链交给系统浏览器，杜绝钓鱼页内嵌。
- **HTTPS 强制**：`network_security_config` 全局禁明文（仅 localhost/10.0.2.2 调试例外）；WebView 禁混合内容。
- **证书异常零容忍**：`onReceivedSslError` 一律 cancel，不实现「继续访问」旁路。
- **最小攻击面**：唯一 INTERNET 权限；`allowBackup=false` + 备份/迁移双规则排除全部私有数据（登录 Cookie 不入云备份）；唯一导出组件为启动 Activity；禁用 `file://`、`content://` 协议；Safe Browsing 开启；定位请求一律拒绝。
- **会话安全**：HttpOnly 会话 Cookie 由系统 CookieManager 管理；进程销毁/切后台自动 flush 持久化，回前台恢复现场。
- **完整签名链**：自建 30 年 RSA 密钥 + v2/v3 方案签名，`apksigner verify` 通过；SHA-256 指纹记录于下方。

## 重新构建（升级版本时）

前置（本目录已备好）：`sdk/`（build-tools 34 + platform 34，腾讯镜像下载）、`jdk/jdk-17.0.2`。

```bash
node build.mjs
```

一条命令完成：aapt2 编译/链接 → javac(JDK17) → d8 → 打包 → zipalign → 自动复用 keystore 签名 → 验证 →
产物写入 `dist/`。改版本号：编辑 `build.mjs` 顶部 `VERSION_NAME/VERSION_CODE`。
（脚本自动用 subst 虚拟盘符规避 aapt2 的中文路径问题，构建后自动清理。）

## 签名密钥（重要！）

- 位置：`keystore/pwb-release.keystore`，口令见 `keystore/密钥信息.txt`（alias: `pwb`）。
- **务必把 `keystore/` 目录整体备份到安全位置**（不要上传网络/仓库）。
  丢失后无法发布同签名升级版，用户只能卸载重装。
- 证书 SHA-256 指纹：`b2eee87ed80ebbd2dbb99f1a4c21875f554700a335585b2ec730869a10eb34e4`

## 目录结构

```
APP/
├─ app/                    # Android 工程源
│  ├─ AndroidManifest.xml
│  ├─ java/cn/kcforge/workbench/MainActivity.java   # WebView 壳（含全部安全策略）
│  ├─ res/                 # 图标(mipmap 5 密度)/启动屏/主题/安全配置
│  └─ assets/offline.html  # 断网提示页（重试按钮）
├─ sdk/                    # 本地构建工具链（build-tools 34 / platform-34）
├─ jdk/jdk-17.0.2          # 构建用 JDK17（R8 与 JDK25 不兼容）
├─ keystore/               # 签名密钥 + 口令（勿外传）
├─ build.mjs               # 一键构建脚本
├─ dist/个人数字工作台-v1.0.0.apk
└─ icon-src.png            # 裁边后的图标源（透明底）
```

## 功能与站点同步

应用即网站：服务器更新后 App 自动获得最新功能（无需升级 APK）。
仅以下行为由壳层提供：返回键沿网页历史后退、图片上传（选图器）、文件下载（下载管理器）、
离线提示与自动重连、OAuth 域内完成登录。
