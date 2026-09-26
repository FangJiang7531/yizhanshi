import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

/**
 * 密码哈希：Argon2id（OWASP 基线参数）。
 * @node-rs/argon2 为预编译原生绑定，Windows/Linux/macOS 均无需本地编译。
 * 密码永不落明文，日志中也不得出现（logger 已 redact）。
 *
 * 注意：Algorithm 是 ambient const enum，在 isolatedModules 下不可访问，
 * 因此直接使用 Argon2id 的数值常量 2（与 Algorithm.Argon2id 等价）。
 * 显式声明该常量可避免依赖枚举类型，同时保持参数可读。
 */
const ARGON2ID = 2;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2Hash(Buffer.from(plain, "utf-8"), ARGON2_OPTIONS);
}

export async function verifyPassword(hashValue: string, plain: string): Promise<boolean> {
  try {
    return await argon2Verify(hashValue, Buffer.from(plain, "utf-8"));
  } catch {
    // 哈希格式非法等情形一律视为校验失败，不向外抛原生错误
    return false;
  }
}
