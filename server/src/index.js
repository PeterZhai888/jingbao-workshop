import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import cardRouter from './routes/card.js'
import adminRouter from './routes/admin.js'
import aiRouter from './routes/ai.js'
import { startMaintenance } from './maintenance.js'

// 全局错误捕获：防止任何未处理异常导致进程静默 crash（Railway 上看不到日志）
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason)
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT) || 3000

console.log('[boot] 启动中...', {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  port: PORT,
  env: process.env.NODE_ENV || 'development',
})

app.set('trust proxy', true) // 生产环境经 Nginx 反代时正确获取客户端 IP
app.use(cors())
app.use(express.json({ limit: '64kb' }))

// 健康检查端点（Railway 会定期检查这个路径）
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() })
})
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() })
})

app.use('/api/card', cardRouter)
app.use('/api/ai', aiRouter)
app.use('/api/admin', adminRouter)

// 生产模式：托管前端构建产物（client/dist），单容器即可完整运行
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
if (fs.existsSync(clientDist)) {
  console.log('[boot] 检测到前端产物，启用静态托管:', clientDist)
  app.use(express.static(clientDist))
  app.get(/^(?!\/api|\/health).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
} else {
  console.warn('[boot] ⚠ 未检测到前端产物:', clientDist)
}

// 统一错误处理：不向客户端暴露底层错误细节
app.use((err, req, res, next) => {
  console.error('[error]', err)
  res.status(500).json({ message: '服务器开小差了，请稍后再试' })
})

// 显式绑定 0.0.0.0，避免某些 Docker 环境下只监听 localhost 导致健康检查失败
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] ✅ 后端服务已启动：0.0.0.0:${PORT}`)
  startMaintenance()
})
