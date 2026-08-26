import express from 'express'
import cors from 'cors'
import cardRouter from './routes/card.js'
import adminRouter from './routes/admin.js'
import aiRouter from './routes/ai.js'

const app = express()
const PORT = process.env.PORT || 3000

app.set('trust proxy', true) // 生产环境经 Nginx 反代时正确获取客户端 IP
app.use(cors())
app.use(express.json({ limit: '64kb' }))

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.use('/api/card', cardRouter)
app.use('/api/ai', aiRouter)
app.use('/api/admin', adminRouter)

// 统一错误处理：不向客户端暴露底层错误细节
app.use((err, req, res, next) => {
  console.error('[error]', err)
  res.status(500).json({ message: '服务器开小差了，请稍后再试' })
})

app.listen(PORT, () => {
  console.log(`[server] 后端服务已启动：http://localhost:${PORT}`)
})
