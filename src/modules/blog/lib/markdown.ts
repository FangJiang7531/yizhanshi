/**
 * Markdown 渲染管线（PRD §5.2.3 / 制作流程 Step 1.2）
 *
 * 管线：remark-parse → remark-gfm → remark-rehype → rehype-sanitize → 增强插件 → rehype-highlight → rehype-stringify
 *
 * 安全决策（PRD 与策划文档冲突处，以 PRD 为准）：
 *   不使用 rehype-raw，allowDangerousHtml: false —— 用户写的 HTML 从源头被转义为纯文本显示。
 *   理由：rehype-raw + rehype-sanitize 组合一旦白名单有疏漏即形成 XSS；
 *   从源头拒绝是更小攻击面的选择（B-11/B-12 验收把关）。
 *
 * 增强（sanitize 之后执行，输出的属性由本模块自己生成，可信）：
 *   - h2/h3 注入 id（目录锚点）并收集目录
 *   - 外链自动加 target="_blank" rel="noopener noreferrer"（C-11）
 *   - 图片注入 loading="lazy"
 *   - 表格包裹 .table-scroll 容器（横向滚动不撑破阅读栏）
 */
import { unified, type Plugin } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import { buildDataCardNodes } from "./data-cards";

// ---------- 最小 hast 结构类型（避免引入 @types/hast 依赖）----------

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

export type TocItem = { depth: number; text: string; id: string };

export type RenderResult = {
  html: string;
  toc: TocItem[];
};

// ---------- 白名单（在 defaultSchema 基础上收紧）----------

/**
 * 禁止的高危标签（defaultSchema 本就不含大部分，此处显式声明意图并补漏）。
 * 注意：input 必须保留 —— GFM 任务列表渲染为只读 checkbox（defaultSchema 已限制
 * 其属性为 type=checkbox / checked / disabled，无交互与提交能力）。
 */
const FORBIDDEN_TAGS = ["iframe", "script", "style", "object", "embed", "form", "textarea", "select", "button", "link", "meta", "base"];

/**
 * 增强插件（标题 id / 外链 rel / img lazy / 表格包裹）在 sanitize **之后**执行，
 * 其输出的属性由本模块自己生成，因此无需在 sanitize 白名单中放行 id/rel/loading。
 * 白名单只做一件事：剔除高危标签（与 defaultSchema 的属性过滤叠加）。
 */
const blogSchema: typeof defaultSchema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((t) => !FORBIDDEN_TAGS.includes(t)),
};

// ---------- 自定义 remark 插件：原始 HTML 降级为纯文本 ----------

type MdNode = { type: string; value?: string; children?: MdNode[] };

/**
 * PRD §5.2.3：用户写的 HTML 从源头被转义为纯文本显示。
 * remark 会把原始 HTML 解析为 mdast `html` 节点；remark-rehype 在 allowDangerousHtml:false
 * 下会直接丢弃该节点（内容消失）。为了让用户看到自己写的标签（而不是内容凭空消失），
 * 这里把 html 节点降级为 text 节点 —— 由 remark-rehype 统一做实体转义，不可执行。
 */
const remarkEscapeHtml: Plugin = () => (tree) => {
  const root = tree as unknown as MdNode;
  const walk = (node: MdNode): void => {
    if (!node.children) return;
    node.children = node.children.map((child) =>
      child.type === "html" ? ({ ...child, type: "text" } as MdNode) : child,
    );
    node.children.forEach(walk);
  };
  walk(root);
};

// ---------- 自定义增强插件 ----------

function collectText(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  if (!node.children) return "";
  return node.children.map(collectText).join("");
}

/** 标题文本 → 锚点 id（保留 Unicode 字母数字，空格转连字符；重名追加序号） */
function headingIdFor(text: string, used: Map<string, number>): string {
  const base =
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .slice(0, 60) || "section";
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

/** TOC 只收录 h2/h3（与 PRD §5.2.3 一致） */
function makeEnhancePlugin(toc: TocItem[]): Plugin {
  return () => (tree) => {
    const root = tree as unknown as HastNode;
    const used = new Map<string, number>();

    /** 深度优先遍历；table 处理完自身后包裹替换，不再重复进入新包装节点 */
    const walk = (node: HastNode, parent: HastNode | null): void => {
      if (node.type === "element" && node.tagName) {
        node.properties ??= {};

        // 跨模块数据卡片：整段为 :::habit-summary{...} / :::task-progress{...} 时替换为卡片
        if (node.tagName === "p") {
          const card = buildDataCardNodes(collectText(node));
          if (card && parent?.children) {
            const index = parent.children.indexOf(node);
            if (index >= 0) parent.children[index] = card;
            return;
          }
        }

        if (node.tagName === "h2" || node.tagName === "h3") {
          const text = collectText(node).trim();
          const id = headingIdFor(text, used);
          node.properties.id = id;
          if (text) toc.push({ depth: node.tagName === "h2" ? 2 : 3, text, id });
        }

        if (node.tagName === "a") {
          const href = String(node.properties.href ?? "");
          if (/^https?:\/\//i.test(href)) {
            node.properties.target = "_blank";
            node.properties.rel = "noopener noreferrer";
          }
        }

        if (node.tagName === "img") {
          node.properties.loading = "lazy";
        }

        if (node.tagName === "pre") {
          // 代码块必须包一层非滚动容器：语言标签与复制按钮要绝对定位，
          // 而 <pre> 自身是横向滚动容器——挂在它里面的元素会跟着代码一起滚走。
          node.children?.forEach((child) => walk(child, node));
          if (parent?.children) {
            const index = parent.children.indexOf(node);
            if (index >= 0) {
              parent.children[index] = {
                type: "element",
                tagName: "div",
                properties: { className: ["blog-code"] },
                children: [node],
              };
            }
          }
          return;
        }

        if (node.tagName === "table") {
          // 先处理表格内部（链接/图片等），再就地包裹替换
          node.children?.forEach((child) => walk(child, node));
          if (parent?.children) {
            const index = parent.children.indexOf(node);
            if (index >= 0) {
              parent.children[index] = {
                type: "element",
                tagName: "div",
                properties: { className: ["table-scroll"] },
                children: [node],
              };
            }
          }
          return;
        }
      }
      node.children?.forEach((child) => walk(child, node));
    };

    walk(root, null);
  };
}

// ---------- 处理器构建 ----------

function buildProcessor(toc: TocItem[]) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkEscapeHtml)
    .use(remarkRehype, { allowDangerousHtml: false }) // ← 从源头拒绝原始 HTML（PRD 决议）
    .use(rehypeSanitize, blogSchema)
    .use(makeEnhancePlugin(toc))
    .use(rehypeHighlight, { detect: false })
    .use(rehypeStringify, { allowDangerousHtml: false });
}

/** 渲染 Markdown 为 HTML（服务端；发布与预览共用同一套管线保证所见即所得） */
export async function renderMarkdown(markdown: string): Promise<RenderResult> {
  const toc: TocItem[] = [];
  const file = await buildProcessor(toc).process(markdown);
  return { html: String(file), toc };
}

/** 仅渲染 HTML（多数调用方只需 html 字符串） */
export async function renderMarkdownHtml(markdown: string): Promise<string> {
  const { html } = await renderMarkdown(markdown);
  return html;
}

/**
 * 归一化从数据库 `Json` 列读回的目录数据。
 *
 * 为什么需要：Prisma 的 `Json?` 在类型上是 `JsonValue`（任意结构），历史数据、
 * 手工 SQL 修改都可能塞进非预期形状。详情页是 SSG/ISR，渲染期抛错会让整页 500，
 * 因此这里做**宽容降级**：形状不合法就丢弃该项，全部不合法则返回空目录（页面只是不显示目录）。
 */
export function normalizeToc(raw: unknown): TocItem[] {
  if (!Array.isArray(raw)) return [];
  const out: TocItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { depth, text, id } = item as Record<string, unknown>;
    if (typeof text !== "string" || typeof id !== "string") continue;
    if (depth !== 2 && depth !== 3) continue;
    out.push({ depth, text, id });
  }
  return out;
}

// ---------- 评论轻量 Markdown（加粗 / 斜体 / 行内代码 / 链接）----------

const commentSchema: typeof defaultSchema = {
  ...defaultSchema,
  tagNames: ["p", "br", "strong", "em", "code", "a"],
  attributes: {
    a: [["href", /^(https?:\/\/|\/)/i], "target", "rel"],
    code: [],
  },
};

/** 评论渲染：比文章更严的白名单（无图片、无标题、无块级结构） */
export async function renderCommentMarkdown(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkEscapeHtml)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSanitize, commentSchema)
    .use(() => (tree) => {
      const root = tree as unknown as HastNode;
      const walk = (node: HastNode): void => {
        if (node.type === "element" && node.tagName === "a") {
          const href = String(node.properties?.href ?? "");
          if (/^https?:\/\//i.test(href)) {
            node.properties ??= {};
            node.properties.target = "_blank";
            node.properties.rel = "noopener noreferrer";
          }
        }
        node.children?.forEach(walk);
      };
      walk(root);
    })
    .use(rehypeStringify, { allowDangerousHtml: false })
    .process(markdown);
  return String(file);
}
