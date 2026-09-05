import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import cardRouter from './src/routes/card.js'
import adminRouter from './src/routes/admin.js'
import aiRouter from './src/routes/ai.js'

const app = express()
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.use(cors())
app.use(express.json({ limit: '64kb' }))

app.get('/health', (req, res) => res.json({ ok: true }))
app.get('/api/health', (req, res) => res.json({ ok: true }))

app.use('/api/card', cardRouter)
app.use('/api/ai', aiRouter)
app.use('/api/admin', adminRouter)

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get(/^(?!\/api|\/health).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// Print all registered routes
const stack = app._router.stack
console.log('=== App Router Stack ===')
stack.forEach((layer, i) => {
  const route = layer.route
  if (route) {
    const methods = Object.keys(route.methods).join(',').toUpperCase()
    console.log(`[${i}] ROUTE ${methods} "${route.path}"`)
  } else if (layer.name === 'router') {
    console.log(`[${i}] SUB-ROUTER mounted at prefix`)
  } else if (layer.name === 'static') {
    console.log(`[${i}] STATIC middleware`)
  } else {
    const pathMatch = layer.regexp ? layer.regexp.toString().slice(0, 60) : 'no-regexp'
    console.log(`[${i}] middleware "${layer.name || 'anon'}" regexp=${pathMatch}`)
  }
})

// Now test
app.listen(3003, () => {
  console.log('\n=== Testing ===')
  setTimeout(async () => {
    const r1 = await fetch('http://localhost:3003/health')
    console.log('/health ->', r1.status, r1.headers.get('content-type'), (await r1.text()).slice(0, 60))
    const r2 = await fetch('http://localhost:3003/api/health')
    console.log('/api/health ->', r2.status, r2.headers.get('content-type'), (await r2.text()).slice(0, 60))
    process.exit(0)
  }, 300)
})
