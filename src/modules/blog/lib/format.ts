/**
 * 博客展示格式化（纯函数，服务端与客户端共用）。
 *
 * ⚠️ 为什么全部用**绝对时间**而不是"3 天前"：
 * 公开页是 ISR 缓存的，缓存命中时渲染结果会被原样复用 —— 相对时间一旦被缓存
 * 就会撒谎（今天写的"1 天前"，一周后仍显示"1 天前"）。因此列表与详情统一输出
 * 绝对日期，需要"多久以前"的场景由客户端组件在挂载后自行计算。
 */

/**
 * 固定时区。
 *
 * 公开页是**共享缓存**，不可能按访问者时区渲染不同结果；博客的目标读者是中文用户，
 * 因此统一按 Asia/Shanghai 展示，同时保证同一天发布/访问的内容日期稳定一致
 * （用运行环境默认时区会导致本地与 CI 产出不同日期，破坏 SSG 产物的确定性）。
 */
const DISPLAY_TZ = "Asia/Shanghai";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: DISPLAY_TZ,
  year: "numeric",
  month: "long",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: DISPLAY_TZ,
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** 「2026年9月30日」；无效输入返回空串（页面不显示时间戳好过显示 Invalid Date） */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateFormatter.format(d);
}

/** 「2026年9月30日 18:00」 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateTimeFormatter.format(d);
}

/** 「2026-09-30」—— 用于 `<time datetime>` 与 RSS 的稳定机器可读格式 */
export function isoDateOnly(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** 计数缩写：1234 → 1.2k；用于点赞/浏览等展示位 */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n / 1000)}k`;
}

/** 阅读时长文案：0 或 1 分钟统一显示「1 分钟」 */
export function formatReadingTime(minutes: number): string {
  return `${Math.max(1, minutes)} 分钟`;
}

/** 截断标题/描述到指定字符数，超出补省略号（中文按字符计） */
export function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
