import { prisma } from "@/lib/db";
import { cache } from "react";

/**
 * 平台功能开关（用户侧读取）：
 * 管理端可一键停用板块；未配置 = 默认启用。
 * enforcement：各板块页面与动作在入口调用 assertFeatureEnabled。
 */

export type FeatureState = { enabled: boolean; disabledReason: string | null };

/** 请求级缓存：同一渲染周期内多次检查只查一次库 */
export const getFeatureStates = cache(async (): Promise<Record<string, FeatureState>> => {
  try {
    const rows = await prisma.featureFlag.findMany();
    const map: Record<string, FeatureState> = {};
    for (const r of rows) map[r.key] = { enabled: r.enabled, disabledReason: r.disabledReason };
    return map;
  } catch {
    return {}; // 读失败按默认（启用）处理，不阻断站点
  }
});

export async function isFeatureEnabled(key: string): Promise<FeatureState> {
  const states = await getFeatureStates();
  return states[key] ?? { enabled: true, disabledReason: null };
}
