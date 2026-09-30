import { headers } from "next/headers";
import { getPrincipal, hashIp } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createCommentService } from "@/modules/blog/services/comment.service";

/**
 * 实时评论流 `/api/blog/posts/[id]/comments/stream`（PRD §5.6：SSE 推送，
 * 新评论 2 秒内到达、25 秒心跳防代理断连）。
 *
 * 实现取舍：**轮询而非 Postgres LISTEN/NOTIFY**——Prisma 不支持 LISTEN，
 * 为一个功能引入第二个数据库客户端得不偿失；2.5s 间隔的增量查询
 * （createdAt 游标 + 索引）对个人规模完全够用，且与列表可见性共用同一
 * service 口径，不会漂移。
 *
 * 安全与稳定性：
 * - 文章必须公开可达（assertPostCommentable），否则 404（不泄漏存在性）；
 * - 读操作对访客开放（评论是公开内容），但连接建立有速率限制防连接风暴；
 * - 单连接最长 5 分钟由服务端主动关闭，客户端 hook 带指数退避重连；
 * - 心跳注释行 `: ping` 每 25s，防代理/负载均衡空闲超时断连。
 */
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 2500;
const HEARTBEAT_INTERVAL_MS = 25_000;
const MAX_CONNECTION_MS = 5 * 60_000;
const MAX_BATCH = 20;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params;

  const commentService = createCommentService();
  try {
    // 公开性校验：草稿/私密/已删 → 404（不泄漏"存在但无权"）
    await commentService.assertPostCommentable(postId);
  } catch {
    return new Response(null, { status: 404 });
  }

  // 连接建立限流（按登录身份或 IP+UA 哈希）
  const principal = await getPrincipal();
  const viewer =
    principal && !("guest" in principal)
      ? { userId: principal.user.id, isAdmin: principal.user.role === "ADMIN" }
      : { userId: null, isAdmin: false };
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
    const ua = h.get("user-agent") ?? "unknown";
    const key = viewer.userId ? `user:${viewer.userId}` : `${ip}|${ua}`;
    await enforceRateLimit(`blog:comment-stream:${hashIp(key) ?? "anon"}`, 20, 60_000);
  } catch (err) {
    if (err instanceof RateLimitError) return new Response(null, { status: 429 });
    throw err;
  }

  // 游标：客户端把已见到的最新评论 createdAt 传上来；缺省从"现在"开始
  const afterParam = new URL(req.url).searchParams.get("after");
  const after = afterParam ? new Date(afterParam) : new Date();
  const cursor = Number.isNaN(after.getTime()) ? new Date() : after;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        clearTimeout(lifetimeTimer);
        try {
          controller.close();
        } catch {
          // 已被下游关闭
        }
      };

      // 客户端断开（EventSource close / 页面卸载）
      req.signal.addEventListener("abort", close);

      // 首条注释：告知客户端重连间隔（浏览器原生重连的兜底；主重连由 hook 退避管理）
      send(`retry: 3000\n\n`);

      const poll = async () => {
        if (closed) return;
        try {
          const items = await commentService.listNewSince(postId, cursor, viewer, MAX_BATCH);
          if (items.length > 0) {
            const latest = items[items.length - 1];
            if (latest) cursor.setTime(new Date(latest.createdAt).getTime());
            send(`event: comments\ndata: ${JSON.stringify({ comments: items })}\n\n`);
          }
        } catch (err) {
          // 查询失败不断流：记录日志，等下一轮
          logger.warn({ module: "blog", err: (err as Error).message }, "comments-stream-poll");
        }
      };

      const pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
      const heartbeatTimer = setInterval(() => send(`: ping\n\n`), HEARTBEAT_INTERVAL_MS);
      // 立即先拉一轮（覆盖"挂载前刚好有新评论"的窗口）
      void poll();
      const lifetimeTimer = setTimeout(close, MAX_CONNECTION_MS);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
