"use server";

import { requireNonGuest } from "@/lib/auth/guards";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createMessageService, type ConversationDTO, type MessageDTO } from "../services/message.service";
import { listMessagesSchema, sendTextMessageSchema } from "../schemas";

/** 私聊控制器：会话列表 / 消息分页 / 发送文字 / 发送图片 */

export async function listConversationsAction(): Promise<ActionResult<ConversationDTO[]>> {
  try {
    const user = await requireNonGuest();
    const messenger = createMessageService();
    return ok(await messenger.listConversations(user.id));
  } catch (err) {
    logger.warn({ module: "notification", err: (err as Error).message }, "listConversationsAction");
    return fail(err);
  }
}

export async function listMessagesAction(
  raw: unknown,
): Promise<ActionResult<{
  conversationId: string;
  peer: { username: string; displayName: string | null; avatarUrl: string | null };
  items: MessageDTO[];
  nextCursor: string | null;
}>> {
  try {
    const user = await requireNonGuest();
    const data = listMessagesSchema.parse(raw);
    const messenger = createMessageService();
    return ok(await messenger.listMessages(user.id, data.username, { cursor: data.cursor ?? null }));
  } catch (err) {
    logger.warn({ module: "notification", err: (err as Error).message }, "listMessagesAction");
    return fail(err);
  }
}

export async function sendTextMessageAction(raw: unknown): Promise<ActionResult<MessageDTO>> {
  try {
    const user = await requireNonGuest();
    const data = sendTextMessageSchema.parse(raw);
    const messenger = createMessageService();
    return ok(await messenger.sendText(user.id, data.username, data.content));
  } catch (err) {
    logger.warn({ module: "notification", err: (err as Error).message }, "sendTextMessageAction");
    return fail(err);
  }
}

export async function sendImageMessageAction(raw: {
  username: string;
  file: File;
}): Promise<ActionResult<MessageDTO>> {
  try {
    const user = await requireNonGuest();
    if (!raw || typeof raw !== "object" || typeof raw.username !== "string" || !(raw.file instanceof File)) {
      return fail(new Error("参数不合法"));
    }
    const messenger = createMessageService();
    return ok(await messenger.sendImage(user.id, raw.username, raw.file));
  } catch (err) {
    logger.warn({ module: "notification", err: (err as Error).message }, "sendImageMessageAction");
    return fail(err);
  }
}
