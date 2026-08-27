#!/bin/bash
# SQLite 数据库每日备份脚本（better-sqlite3 backup API，WAL 模式下安全，不阻塞写入）
# 用法：bash scripts/backup.sh
# 建议加 crontab（每天凌晨 3 点）：0 3 * * * cd /path/to/project && bash scripts/backup.sh >> /tmp/db-backup.log 2>&1
set -Eeuo pipefail

cd "$(dirname "$0")/.."

DB_PATH="${DB_PATH:-./data/ai-video-tool.db}"
BACKUP_DIR="${BACKUP_DIR:-./data/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"   # 备份保留天数

if [ ! -f "$DB_PATH" ]; then
  echo "[backup] 数据库不存在: $DB_PATH，跳过"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

STAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/ai-video-tool_$STAMP.db"

node -e "
const Database = require('better-sqlite3');
const db = new Database('$DB_PATH', { readonly: true });
db.backup('$BACKUP_FILE')
  .then(() => { db.close(); process.exit(0); })
  .catch((e) => { console.error(e.message); db.close(); process.exit(1); });
"

if [ ! -s "$BACKUP_FILE" ]; then
  echo "[backup] 备份失败：文件为空"
  rm -f "$BACKUP_FILE"
  exit 1
fi

echo "[backup] 已备份: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# 清理过期备份
find "$BACKUP_DIR" -name "ai-video-tool_*.db" -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
echo "[backup] 已清理 ${KEEP_DAYS} 天前的旧备份"
