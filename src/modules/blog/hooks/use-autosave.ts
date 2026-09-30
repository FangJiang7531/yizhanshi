"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 编辑器自动保存（PRD §5.2.4 三层保险 + 冲突处理）。
 *
 * 三层：
 *   ① 内存层 —— 调用方 state 即时更新（本 hook 不持有表单状态，只被 touch() 通知）
 *   ② 本地层 —— 每 3 秒把未同步载荷写入 localStorage（防崩溃/误关闭）
 *   ③ 服务端 —— 停止输入 5 秒后 debounce 保存；最多每 30 秒强制保存一次；
 *              失败后 10 秒自动重试；网络恢复（online 事件）立即重试
 *
 * 冲突（多标签页）：保存返回 CONFLICT 时进入冲突态并**冻结自动保存**，
 * 由 UI 弹「保留服务端 / 保留本地 / 对比查看」。绝不静默覆盖。
 *
 * 计时用单个 1s tick 轮询而非多个 setTimeout：状态机只有「距离上次输入/上次保存
 * 多久」两个变量，轮询实现更少竞态（保存中再编辑、重试与 debounce 相互打断等）。
 */

const DEBOUNCE_MS = 5_000;
const FORCE_MS = 30_000;
const LOCAL_MS = 3_000;
const RETRY_MS = 10_000;
const TICK_MS = 1_000;

export type AutosaveStatus = "saved" | "dirty" | "saving" | "error" | "offline" | "conflict";

export type AutosaveSaveResult =
  | { success: true; data: { post?: { updatedAt?: string } } }
  | { success: false; error: { code: string; message: string } };

export type LocalDraftBackup<T> = {
  payload: T;
  baseUpdatedAt?: string;
  savedAt: number;
};

function localKey(postId: string): string {
  return `pwb:blog:draft:${postId}`;
}

/** 读取本地副本（编辑器加载时用于"恢复未同步内容"提示） */
export function readLocalDraft<T>(postId: string): LocalDraftBackup<T> | null {
  try {
    const raw = window.localStorage.getItem(localKey(postId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraftBackup<T>;
    if (!parsed || typeof parsed.savedAt !== "number" || !parsed.payload) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLocalDraft(postId: string): void {
  try {
    window.localStorage.removeItem(localKey(postId));
  } catch {
    /* 隐私模式等场景下 localStorage 不可用，静默降级 */
  }
}

function writeLocalDraft<T>(postId: string, backup: LocalDraftBackup<T>): void {
  try {
    window.localStorage.setItem(localKey(postId), JSON.stringify(backup));
  } catch {
    /* 配额满/隐私模式：本地层降级，服务端层不受影响 */
  }
}

export type UseAutosaveOptions<T> = {
  postId: string;
  /** 读取最新载荷（保持引用最新；hook 不持有表单状态） */
  getPayload: () => T;
  /** 服务端保存（保持引用最新） */
  save: (payload: T, baseUpdatedAt: string | undefined) => Promise<AutosaveSaveResult>;
  /** 初始乐观锁基线（页面加载时服务端的 updatedAt） */
  initialUpdatedAt: string;
  /** 保存成功（拿到最新 updatedAt，用于顶部"已保存"之外的联动） */
  onSaved?: (data: { post?: { updatedAt?: string } }) => void;
  /** 保存失败（非冲突）时的用户提示入口 */
  onError?: (message: string) => void;
  /** 冲突发生时的用户提示入口（UI 弹对话框） */
  onConflict?: (message: string) => void;
};

export function useAutosave<T>(options: UseAutosaveOptions<T>) {
  const { postId, getPayload, save, initialUpdatedAt, onSaved, onError, onConflict } = options;

  const baseUpdatedAtRef = useRef<string | undefined>(initialUpdatedAt);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const conflictRef = useRef(false);
  const seqRef = useRef(0);
  const lastChangeRef = useRef(0);
  const lastSaveRef = useRef(Date.now());
  const lastLocalRef = useRef(0);
  const retryAtRef = useRef(0);
  const statusRef = useRef<AutosaveStatus>("saved");

  const [status, setStatusState] = useState<AutosaveStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [conflict, setConflict] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  /** 同步更新状态与镜像 ref（tick 在回调外读 ref，避免闭包过期） */
  const setStatus = useCallback((next: AutosaveStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const doSave = useCallback(
    async (reason: "debounce" | "manual" | "retry"): Promise<boolean> => {
      if (savingRef.current || conflictRef.current) return false;
      if (!dirtyRef.current) return reason === "manual" ? true : false;

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setStatus("offline");
        return false;
      }

      savingRef.current = true;
      setStatus("saving");
      const seqAtStart = seqRef.current;
      try {
        const res = await save(getPayload(), baseUpdatedAtRef.current);
        if (res.success) {
          const latest = res.data?.post?.updatedAt;
          if (latest) baseUpdatedAtRef.current = latest;
          // 保存期间又发生编辑（seq 前进）→ 保持 dirty，不清理本地副本
          if (seqRef.current === seqAtStart) {
            dirtyRef.current = false;
            setIsDirty(false);
            clearLocalDraft(postId);
          }
          lastSaveRef.current = Date.now();
          setLastSavedAt(new Date());
          setStatus("saved");
          onSaved?.(res.data);
          return true;
        }

        if (res.error.code === "CONFLICT") {
          conflictRef.current = true;
          setConflict(true);
          setStatus("conflict");
          onConflict?.(res.error.message);
          return false;
        }

        setStatus("error");
        retryAtRef.current = Date.now() + RETRY_MS;
        onError?.(res.error.message);
        return false;
      } finally {
        savingRef.current = false;
      }
    },
    [getPayload, save, postId, onSaved, onError, onConflict, setStatus],
  );

  /** 字段变化时调用：标记 dirty、重置 debounce 时钟、更新 UI 状态 */
  const touch = useCallback(() => {
    if (conflictRef.current) return;
    seqRef.current += 1;
    dirtyRef.current = true;
    lastChangeRef.current = Date.now();
    setIsDirty(true);
    if (statusRef.current !== "saving") setStatus("dirty");
  }, [setStatus]);

  /** 立即保存（手动保存 / Cmd+S） */
  const flush = useCallback(() => doSave("manual"), [doSave]);

  /** ③ 主循环：localStorage 节奏 + 服务端 debounce/force/retry */
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (conflictRef.current || savingRef.current || !dirtyRef.current) return;
      const now = Date.now();

      if (now - lastLocalRef.current >= LOCAL_MS) {
        writeLocalDraft<T>(postId, {
          payload: getPayload(),
          baseUpdatedAt: baseUpdatedAtRef.current,
          savedAt: now,
        });
        lastLocalRef.current = now;
      }

      if (statusRef.current === "error" || statusRef.current === "offline") {
        if (now >= retryAtRef.current) void doSave("retry");
        return;
      }

      const debounceDue = now - lastChangeRef.current >= DEBOUNCE_MS;
      const forceDue = now - lastSaveRef.current >= FORCE_MS;
      if (debounceDue || forceDue) void doSave("debounce");
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [postId, getPayload, doSave]);

  /** 网络恢复：立即重试未同步的变更（Gate 5.3-1） */
  useEffect(() => {
    const handleOnline = () => {
      if (dirtyRef.current && !conflictRef.current) {
        retryAtRef.current = 0;
        void doSave("retry");
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [doSave]);

  /** 关闭/刷新页面前的未保存警告 */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  /**
   * 冲突处理①「保留本地」：丢弃基线（服务端 schema 的 baseUpdatedAt 可选，
   * 不传即跳过冲突检查），立即覆盖写服务端。
   */
  const keepLocal = useCallback(async (): Promise<boolean> => {
    conflictRef.current = false;
    setConflict(false);
    baseUpdatedAtRef.current = undefined;
    dirtyRef.current = true;
    setIsDirty(true);
    return doSave("manual");
  }, [doSave]);

  /** 冲突处理②「保留服务端」：丢弃本地变更并清本地副本；调用方负责刷新表单为服务端版本 */
  const keepServer = useCallback(() => {
    conflictRef.current = false;
    setConflict(false);
    dirtyRef.current = false;
    setIsDirty(false);
    clearLocalDraft(postId);
    setStatus("saved");
  }, [postId, setStatus]);

  return {
    status,
    lastSavedAt,
    conflict,
    isDirty,
    touch,
    flush,
    keepLocal,
    keepServer,
  };
}
