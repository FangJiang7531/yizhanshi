import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { createSessionRecord } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

/**
 * OAuth 授权码流程（GitHub / Google），自实现——复用既有数据库 Session 体系。
 *
 * CSRF：state 为随机串，HMAC 签名后写入短期 Cookie；回调时校验签名与会话绑定。
 * 账号匹配：优先 provider+providerAccountId（AuthAccount 唯一约束），其次 email
 * （已验证邮箱才自动合并；未验证邮箱不合并，防止账号抢占）。
 * 出站请求固定 https:// 且域名白名单（github.com / googleapis.com），不接受任意跳转。
 */

export type OAuthProvider = "github" | "google";

export type OAuthProfile = {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export function isProviderConfigured(provider: OAuthProvider): boolean {
  if (provider === "github") {
    return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
  }
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function listEnabledProviders(): OAuthProvider[] {
  const all: OAuthProvider[] = ["github", "google"];
  return all.filter(isProviderConfigured);
}

// ---------- state 签名 ----------

function signState(raw: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(raw).digest("base64url");
}

/** 生成 state 与回调校验值（state 存 Cookie，回调时对比） */
export function createState(): { state: string; cookieValue: string } {
  const raw = randomBytes(16).toString("base64url");
  return { state: raw, cookieValue: `${raw}.${signState(raw)}` };
}

/** 校验回调 state：签名必须有效（时序安全比较） */
export function verifyState(state: string | null, cookieValue: string | undefined): boolean {
  if (!state || !cookieValue) return false;
  const dot = cookieValue.indexOf(".");
  if (dot <= 0) return false;
  const raw = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (raw !== state) return false;
  const expected = signState(raw);
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const OAUTH_STATE_COOKIE = "pwb_oauth_state";

// ---------- 授权 URL ----------

export function buildAuthorizeUrl(provider: OAuthProvider, state: string): string {
  const redirectUri = `${env.APP_URL}/api/auth/oauth/${provider}/callback`;
  if (provider === "github") {
    const p = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      scope: "read:user user:email",
      state,
      allow_signup: "true",
    });
    return `https://github.com/login/oauth/authorize?${p.toString()}`;
  }
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

// ---------- token 交换与用户信息 ----------

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  if (!/^https:\/\/(api\.github\.com|github\.com|openidconnect\.googleapis\.com|oauth2\.googleapis\.com)\//.test(url)) {
    throw new Error(`非预期的 OAuth 出站地址：${new URL(url).host}`);
  }
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "personal-workbench",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`OAuth 请求失败：${res.status}`);
  }
  return (await res.json()) as T;
}

export async function exchangeCodeForProfile(
  provider: OAuthProvider,
  code: string,
): Promise<OAuthProfile> {
  if (provider === "github") {
    const tokenJson = await fetchJson<{ access_token?: string }>(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${env.APP_URL}/api/auth/oauth/github/callback`,
        }),
      },
    );
    const accessToken = tokenJson.access_token;
    if (!accessToken) throw new Error("GitHub 未返回 access_token");
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    const user = await fetchJson<{
      id: number;
      login: string;
      name: string | null;
      avatar_url: string | null;
      email: string | null;
    }>("https://api.github.com/user", { headers: authHeader });

    let email = user.email;
    let emailVerified = email !== null;
    if (!email) {
      // 私密邮箱：拉取已验证邮箱列表取主邮箱
      const emails = await fetchJson<{ email: string; primary: boolean; verified: boolean }[]>(
        "https://api.github.com/user/emails",
        { headers: authHeader },
      );
      const primary = emails.find((e) => e.primary && e.verified);
      email = primary?.email ?? null;
      emailVerified = Boolean(primary);
    }

    return {
      provider,
      providerAccountId: String(user.id),
      email,
      emailVerified,
      username: user.login,
      displayName: user.name,
      avatarUrl: user.avatar_url,
    };
  }

  // Google
  const tokenJson = await fetchJson<{ access_token?: string }>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID ?? "",
        client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
        code,
        grant_type: "authorization_code",
        redirect_uri: `${env.APP_URL}/api/auth/oauth/google/callback`,
      }).toString(),
    },
  );
  const accessToken = tokenJson.access_token;
  if (!accessToken) throw new Error("Google 未返回 access_token");

  const userinfo = await fetchJson<{
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  }>("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return {
    provider,
    providerAccountId: userinfo.sub,
    email: userinfo.email ?? null,
    emailVerified: Boolean(userinfo.email_verified),
    username: (userinfo.email?.split("@")[0] ?? `gg_${userinfo.sub.slice(0, 8)}`).toLowerCase(),
    displayName: userinfo.name ?? null,
    avatarUrl: userinfo.picture ?? null,
  };
}

// ---------- 账号落库与登录 ----------

export type OAuthLoginResult =
  | { ok: true; sessionToken: string; isNew: boolean }
  | { ok: false; reason: string };

export async function loginWithProfile(profile: OAuthProfile): Promise<OAuthLoginResult> {
  // ① 已绑定的第三方账号直接登录
  const linked = await prisma.authAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    },
    include: { user: true },
  });
  if (linked) {
    if (linked.user.status !== "ACTIVE") return { ok: false, reason: "账号已被停用" };
    const sessionToken = await createSessionRecord(linked.user.id, {});
    return { ok: true, sessionToken, isNew: false };
  }

  if (!profile.email) {
    return { ok: false, reason: "第三方账号未提供邮箱，无法建立登录" };
  }

  // ② 邮箱已注册：仅当第三方邮箱已验证才自动绑定（防止邮箱抢占）
  const existing = await prisma.user.findUnique({ where: { email: profile.email.toLowerCase() } });
  if (existing) {
    if (existing.status !== "ACTIVE") return { ok: false, reason: "账号已被停用" };
    if (!profile.emailVerified) {
      return { ok: false, reason: "该邮箱已被注册，且第三方邮箱未经验证，无法自动绑定" };
    }
    await prisma.$transaction([
      prisma.authAccount.create({
        data: {
          userId: existing.id,
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      }),
      ...(existing.emailVerifiedAt
        ? []
        : [prisma.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() } })]),
    ]);
    const sessionToken = await createSessionRecord(existing.id, {});
    return { ok: true, sessionToken, isNew: false };
  }

  // ③ 新用户：OAuth 注册（无密码；用户名从 provider 用户名规范化，冲突自动加后缀）
  const base =
    profile.username.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "").slice(0, 16) || "user";
  let username = base;
  for (let i = 0; i < 10; i++) {
    const clash = await prisma.user.findUnique({ where: { username } });
    if (!clash) break;
    username = `${base}_${Math.floor(Math.random() * 1000)}`;
  }
  const created = await prisma.user.create({
    data: {
      username,
      email: profile.email.toLowerCase(),
      displayName: profile.displayName ?? profile.username,
      avatarUrl: profile.avatarUrl,
      emailVerifiedAt: profile.emailVerified ? new Date() : null,
      authAccounts: {
        create: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      setting: { create: {} },
    },
  });
  logger.info({ module: "oauth", userId: created.id, provider: profile.provider }, "OAuth 新用户注册");
  const sessionToken = await createSessionRecord(created.id, {});
  return { ok: true, sessionToken, isNew: true };
}
