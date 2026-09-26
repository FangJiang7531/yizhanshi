/**
 * 工具服务客户端（ToolServiceClient）—— 仅接口，本期不实现请求逻辑。
 * 第 6、7 板块（视频下载 / 文档转换）的存量 Python 工具经此接缝接入：
 * 内部服务令牌鉴权、超时 + 重试上限 + 降级提示，工具服务不可用时主站不连带不可用。
 */
export type ToolName = "downloader" | "docconvert";

export interface ToolServiceClient {
  /** 提交一个工具任务（如解析视频 / 转换文档），返回任务 ID */
  submit(tool: ToolName, payload: Record<string, unknown>): Promise<{ taskId: string }>;
  /** 轮询任务进度 */
  progress(tool: ToolName, taskId: string): Promise<{ percent: number; status: string }>;
  /** 获取任务结果（下载地址 / 转换结果引用） */
  result(tool: ToolName, taskId: string): Promise<{ url: string }>;
}

export class ToolServiceUnavailableError extends Error {
  constructor(tool: ToolName) {
    super(`工具服务（${tool}）暂不可用，请稍后再试`);
    this.name = "ToolServiceUnavailableError";
  }
}

/** 阶段六实现：基于 env.TOOL_SERVICE_*_URL + TOOL_SERVICE_TOKEN 的 HTTP 客户端 */
export function createToolServiceClient(): ToolServiceClient {
  throw new Error("工具服务接入在阶段六实现");
}
