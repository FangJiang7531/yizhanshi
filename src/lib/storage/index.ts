/**
 * 存储抽象（StorageAdapter）—— 本期实现本地磁盘适配器。
 * 后续切换 S3 兼容对象存储时业务代码零改动（只换适配器）。
 */
export interface StorageAdapter {
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export class LocalDiskAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  /** 存储路径与文件名分离，防路径穿越：key 只允许受限字符 */
  private safePath(key: string): string {
    if (!/^[A-Za-z0-9/_\-.]+$/.test(key) || key.includes("..")) {
      throw new Error(`非法存储键：${key}`);
    }
    return join(this.root, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.safePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.safePath(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.safePath(key), { force: true });
  }
}

import { env } from "@/config/env";

export const storage: StorageAdapter = new LocalDiskAdapter(env.STORAGE_LOCAL_DIR);
