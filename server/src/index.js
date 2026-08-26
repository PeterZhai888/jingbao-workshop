import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import cardRouter from './routes/card.js'
import adminRouter from './routes/admin.js'
import aiRouter from './routes/ai.js'
import { startMaintenance } from './maintenance.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

app.set('trust proxy', true) // 生产环境经 Nginx 反代时正确获取客户端 IP
app.use(cors())
app.use(express.json({ limit: '64kb' }))

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.use('/api/card', cardRouter)
app.use('/api/ai', aiRouter)
app.use('/api/admin', adminRouter)

// 生产模式：托管前端构建产物（client/dist），单容器即可完整运行
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// 统一错误处理：不向客户端暴露底层错误细节
app.use((err, req, res, next) => {
  console.error('[error]', err)
  res.status(500).json({ message: '服务器开小差了，请稍后再试' })
})

app.listen(PORT, () => {
  console.log(`[server] 后端服务已启动：http://localhost:${PORT}`)
  startMaintenance()
})
