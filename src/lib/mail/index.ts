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
  await mailAdapter.send({
    to,
    subject: "【个人数字工作台】注册验证码",
    text: `你的注册验证码是：${code}（5 分钟内有效，单次可用）。\n如果这不是你本人的操作，请忽略本邮件。`,
  });
}
