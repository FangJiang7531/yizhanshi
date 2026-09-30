"use client";

import { useEffect, useRef, useState } from "react";
import type { CommentDTO } from "../types";

/**
 * 实时评论流 hook（PRD §5.6：SSE 推送 + 断线指数退避重连）。
 *
 * 不用浏览器 EventSource 的原生自动重连：它是固定间隔，不满足
 * "指数退避"要求；且服务端 5 分钟强制断流时会与原生重连叠加。
 * 这里自管连接：1s → 2s → 4s … 封顶 30s，每次重连加 ±30% 抖动避免雪崩同步。
 */
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

export function useCommentStream(
  postId: string,
  onComments: (comments: CommentDTO[]) => void,
  enabled: boolean,
) {
  const [connected, setConnected] = useState(false);
  // 回调经 ref 透传：重连循环不会因为回调身份变化而重建连接
  const cbRef = useRef(onComments);
  cbRef.current = onComments;

  useEffect(() => {
    if (!enabled) return;

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      es = new EventSource(`/api/blog/posts/${postId}/comments/stream`);

      es.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      // 服务端事件名 comments（见 stream route）
      es.addEventListener("comments", (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent<string>).data) as { comments: CommentDTO[] };
          if (Array.isArray(payload.comments) && payload.comments.length > 0) {
            cbRef.current(payload.comments);
          }
        } catch {
          // 单条坏消息不影响连接
        }
      });
      es.onerror = () => {
        es?.close();
        es = null;
        setConnected(false);
        if (disposed) return;
        // 指数退避 + 抖动
        const jitter = 0.7 + Math.random() * 0.6;
        const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt) * jitter;
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      setConnected(false);
    };
  }, [postId, enabled]);

  return { connected };
}
