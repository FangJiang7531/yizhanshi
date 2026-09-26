/**
 * 邮件适配器（MailAdapter）—— 本期实现控制台日志适配器：
 * 开发环境验证码直接打到控制台/日志，真实投递（Resend / SMTP）在后续阶段接入。
 */
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

export const mailAdapter: MailAdapter = new ConsoleMailAdapter();

export async function sendVerificationCodeEmail(to: string, code: string): Promise<void> {
  e2eCapture(to, code);
  await mailAdapter.send({
    to,
    subject: "【个人数字工作台】注册验证码",
    text: `你的注册验证码是：${code}（5 分钟内有效，单次可用）。\n如果这不是你本人的操作，请忽略本邮件。`,
  });
}
