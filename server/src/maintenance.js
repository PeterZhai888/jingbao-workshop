import db from './db.js'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups')
const LOG_RETENTION_DAYS = 30
const BACKUP_INTERVAL_MS = 7 * 24 * 3600 * 1000
const MAX_BACKUPS = 8 // 保留最近 8 份（约两个月）

/** 日志保留 30 天，超期自动清理 */
export function cleanOldLogs() {
  const result = db
    .prepare(`DELETE FROM usage_logs WHERE created_at < datetime('now', '-${LOG_RETENTION_DAYS} days')`)
    .run()
  if (result.changes > 0) {
    console.log(`[maintenance] 已清理 ${result.changes} 条过期日志（保留 ${LOG_RETENTION_DAYS} 天）`)
  }
}

/** 数据库备份：VACUUM INTO 生成压缩快照，写入 data/backups/ 目录 */
export function backupDatabase() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
    const stamp = new Date().toISOString().slice(0, 10)
    const target = path.join(BACKUP_DIR, `app-${stamp}.db`)
    if (fs.existsSync(target)) fs.unlinkSync(target) // VACUUM INTO 要求目标文件不存在
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
    console.log(`[maintenance] 数据库已备份：${target}`)
    // 清理过期备份
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('app-') && f.endsWith('.db'))
      .sort()
    while (files.length > MAX_BACKUPS) {
      const oldest = files.shift()
      fs.unlinkSync(path.join(BACKUP_DIR, oldest))
    }
  } catch (err) {
    console.error('[maintenance] 备份失败:', err.message)
  }
}

/** 启动时执行一次 + 定时调度 */
export function startMaintenance() {
  cleanOldLogs()
  backupDatabase()
  setInterval(cleanOldLogs, 24 * 3600 * 1000).unref()
  setInterval(backupDatabase, BACKUP_INTERVAL_MS).unref()
}
