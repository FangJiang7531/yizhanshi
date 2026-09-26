#!/bin/sh
set -e

echo "[entrypoint] 等待数据库就绪…"
i=0
until node -e "
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.connect().then(() => c.query('SELECT 1')).then(() => { c.end(); process.exit(0); }).catch(() => process.exit(1));
" 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -ge 30 ]; then
    echo "[entrypoint] 数据库 30 次探测未就绪，退出"
    exit 1
  fi
  sleep 1
done

echo "[entrypoint] 执行数据库迁移（prisma migrate deploy）…"
npx prisma migrate deploy

echo "[entrypoint] 启动应用…"
exec "$@"
