import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { verifyCard } from '../api/client.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../components/Toast.jsx'

/** 首页：一屏式极简 —— 产品名 + 一句话 + 卡密输入 */
export default function Home() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useSession()
  const { show } = useToast()
  const navigate = useNavigate()

  async function handleVerify(e) {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      show('请输入卡密')
      return
    }
    setLoading(true)
    try {
      const data = await verifyCard(trimmed)
      login(data)
      show('卡密验证成功', 'success')
      navigate('/storyboard')
    } catch (err) {
      show(err.message || '卡密验证失败，请检查后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-in flex flex-col items-center pt-[18vh] sm:pt-[22vh]">
      <h1 className="text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
        把想法变成短视频脚本
      </h1>
      <p className="mt-3 text-center text-sm text-gray-500">
        文案拆分镜 · 爆款标题生成 · 输入卡密即用
      </p>

      <form onSubmit={handleVerify} className="mt-10 flex w-full max-w-sm flex-col gap-3 sm:flex-row">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="卡密，如 SP-A3K9M2X7P5Q1"
          className="h-11 w-full flex-1 rounded-lg border border-gray-300 bg-white px-4 text-sm outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          maxLength={20}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={loading}
          className="h-11 shrink-0 rounded-lg bg-blue-600 px-6 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? '验证中…' : '开始使用'}
        </button>
      </form>

      <p className="mt-4 text-xs text-gray-400">无需注册，卡密由管理员发放</p>

      <footer className="mt-auto pb-6 pt-24 text-xs text-gray-300">
        <a href="/admin/login" className="transition-colors hover:text-gray-500">
          管理后台
        </a>
      </footer>
    </div>
  )
}
