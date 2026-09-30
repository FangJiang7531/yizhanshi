-- 全文搜索扩展与 GIN 索引（表达式索引，Prisma 不支持声明式定义，必须手写）
-- 注意：本迁移由手写生成，勿因 schema.prisma 中无此索引而删除（制作流程文档 Step 0.4）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS blog_post_search_idx ON "BlogPost"
USING GIN ((title || ' ' || coalesce(excerpt, '') || ' ' || "contentMd") gin_trgm_ops);
