/**
 * 统一类型化错误体系。
 * Server Action / Route Handler 绝不把原始异常抛给客户端：一律经 toAppError 收敛后
 * 返回 { success:false, error } 结构。日志可含堆栈，响应体永不暴露堆栈、SQL、内部路径。
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string[]>;

  constructor(code: ErrorCode, message: string, status = 500, fields?: Record<string, string[]>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export class ValidationError extends AppError {
  constructor(fields: Record<string, string[]>, message = "输入不合法") {
    super("VALIDATION_ERROR", message, 400, fields);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "请先登录") {
    super("UNAUTHORIZED", message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "没有执行该操作的权限") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "资源不存在") {
    // “不存在”与“不属于你”统一返回 404 语义，避免通过错误码探测他人资源
    super("NOT_FOUND", message, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "资源冲突") {
    super("CONFLICT", message, 409);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "操作过于频繁，请稍后再试") {
    super("RATE_LIMITED", message, 429);
    this.name = "RateLimitError";
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  // 未知异常收敛为 INTERNAL，绝不把原始堆栈暴露给客户端
  return new AppError("INTERNAL", "服务器内部错误，请稍后重试", 500);
}

/** Server Action 的统一返回结构 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: ErrorCode; message: string; fields?: Record<string, string[]> } };

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function fail(err: unknown): ActionResult<never> {
  const appErr = toAppError(err);
  return {
    success: false,
    error: { code: appErr.code, message: appErr.message, fields: appErr.fields },
  };
}
