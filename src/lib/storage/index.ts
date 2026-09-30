/**
 * 存储抽象（StorageAdapter）—— 本期实现本地磁盘适配器。
 * 后续切换 S3 兼容对象存储时业务代码零改动（只换适配器）。
 */
export interface StorageAdapter {
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  /**
   * 统计某前缀下已占用的字节数（博客模块的用户配额校验用）。
   * 本地磁盘实现走目录递归；切换到对象存储时应换成 ListObjects + 累加。
   * 声明为可选：阶段一已有的调用方（头像）不需要它。
   */
  usage?(prefix: string): Promise<number>;
}

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
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

  /** 递归统计前缀目录下的文件总字节数（配额校验用） */
  async usage(prefix: string): Promise<number> {
    const dir = this.safePath(prefix.replace(/\/+$/, ""));
    let total = 0;
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return 0; // 目录不存在 = 零占用
    }
    for (const entry of entries) {
      const child = `${prefix.replace(/\/+$/, "")}/${entry.name}`;
      if (entry.isDirectory()) {
        total += await this.usage(child);
      } else if (entry.isFile()) {
        try {
          total += (await stat(this.safePath(child))).size;
        } catch {
          // 文件在遍历中被删除：忽略
        }
      }
    }
    return total;
  }
}

import { env } from "@/config/env";

export const storage: StorageAdapter = new LocalDiskAdapter(env.STORAGE_LOCAL_DIR);
