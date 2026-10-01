/**
 * 邮件适配器（MailAdapter）—— 按环境变量自动选择：
 * - SMTP_HOST/SMTP_USER/SMTP_PASS 三者齐备 → SmtpMailAdapter（真实投递）
 * - 否则 → ConsoleMailAdapter（验证码打印到服务端控制台，开发/E2E 用）
 */
import { env } from "@/config/env";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface MailAdapter {
  send(payload: MailPayload): Promise<void>;
}

/**
 * E2E 专用验证码捕获：仅在 NODE_ENV=development 且显式设置 E2E_CAPTURE_CODE=1 时生效。
 * 生产环境永远为空，不构成后门。
 * 注意：Next dev 中 Server Action 与 Route Handler 属于不同模块图，模块级变量不共享，
 * 因此必须挂在 globalThis 上（同一 Node 进程内共享）。
 */
const e2eEnabled =
  process.env.NODE_ENV === "development" && process.env.E2E_CAPTURE_CODE === "1";
const globalStore = globalThis as unknown as { __pwbE2ECodes?: Map<string, string> };
const e2eCodes = (globalStore.__pwbE2ECodes ??= new Map<string, string>());

function e2eCapture(email: string, code: string) {
  if (e2eEnabled) e2eCodes.set(email, code);
}

export function getE2ECapturedCode(email: string): string | null {
  if (!e2eEnabled) return null;
  return e2eCodes.get(email) ?? null;
}

class ConsoleMailAdapter implements MailAdapter {
  async send(payload: MailPayload): Promise<void> {
    // 只输出到服务端控制台；验证码属于敏感信息，禁止进入结构化日志
    console.info(
      [
        "─────────────── [MailAdapter:console] ───────────────",
        `To     : ${payload.to}`,
        `Subject: ${payload.subject}`,
        payload.text,
        "─────────────────────────────────────────────────────",
      ].join("\n"),
    );
  }
}

class SmtpMailAdapter implements MailAdapter {
  private transport: Transporter;
  readonly from: string;

  constructor() {
    // 发件人：显式 MAIL_FROM 优先；QQ/Foxmail SMTP 要求 From 必须等于认证账号，故回退 SMTP_USER
    this.from = env.MAIL_FROM ?? env.SMTP_USER!;
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE === "true",
      requireTLS: env.SMTP_SECURE !== "true",
      auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
    });
    console.info(
      `[MailAdapter:smtp] 已启用真实邮件投递 → ${env.SMTP_HOST}:${env.SMTP_PORT}（secure=${env.SMTP_SECURE}），发件人 ${this.from}`,
    );
  }

  async send(payload: MailPayload): Promise<void> {
    // 发送失败向上抛出（由调用方转化为用户可见错误），绝不静默丢码
    await this.transport.sendMail({
      from: this.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      ...(payload.html ? { html: payload.html } : {}),
    });
  }
}

const smtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
export const mailAdapter: MailAdapter = smtpConfigured
  ? new SmtpMailAdapter()
  : new ConsoleMailAdapter();

/** E2E 捕获模式下强制走控制台：@test.local 收件人不可投递，避免污染真实邮件通道 */
const e2eConsoleAdapter: MailAdapter = new ConsoleMailAdapter();

export async function sendVerificationCodeEmail(to: string, code: string): Promise<void> {
  e2eCapture(to, code);
  const adapter: MailAdapter = e2eEnabled ? e2eConsoleAdapter : mailAdapter;
  await adapter.send({
    to,
    subject: "【个人数字工作台】注册验证码",
    text: `你的注册验证码是：${code}（5 分钟内有效，单次可用）。\n如果这不是你本人的操作，请忽略本邮件。`,
  });
}
