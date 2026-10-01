/**
 * SMTP 通道自检脚本：
 * 用 .env 中的 SMTP 配置通过 nodemailer 发一封测试邮件到发件邮箱自身，
 * 验证授权码、网络与 TLS 全链路。用法：node scripts/smtp-verify.mjs
 */
import { readFileSync } from "node:fs";
import nodemailer from "nodemailer";

// 极简 .env 解析（仅取 SMTP_* / MAIL_FROM）
const env = {};
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*"(.*)"\s*$/);
  if (m) env[m[1]] = m[2];
}

const host = env.SMTP_HOST;
const port = Number(env.SMTP_PORT || 465);
const user = env.SMTP_USER;
const pass = env.SMTP_PASS;
const secure = env.SMTP_SECURE !== "false";
if (!host || !user || !pass) {
  console.error("SMTP 配置不完整（SMTP_HOST/SMTP_USER/SMTP_PASS）");
  process.exit(1);
}

console.log(`连接 ${host}:${port}（secure=${secure}），账号 ${user} ...`);
const transport = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
});

try {
  const info = await transport.sendMail({
    from: env.MAIL_FROM || user,
    to: user,
    subject: "【个人数字工作台】SMTP 配置验证",
    text: "这是一封配置验证邮件：注册验证码现在将通过 SMTP 真实投递。\n收到此邮件即代表邮件通道已就绪。",
  });
  console.log("✅ 发送成功:", info.messageId, "| 响应:", info.response);
} catch (err) {
  console.error("❌ 发送失败:", err.code || "", err.message);
  process.exit(1);
}
