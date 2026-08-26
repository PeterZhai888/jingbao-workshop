import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { verifyCard } from '../api/client.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../components/Toast.jsx'

const FEATURES = [
  {
    icon: '🎬',
    title: 'AI 文案分镜拆解',
    desc: '粘贴文案，一键拆解为可拍摄的分镜脚本：画面、台词、时长、运镜全都有',
  },
  {
    icon: '✨',
    title: 'AI 爆款标题生成',
    desc: '输入视频主题，一次生成 10 组适配抖音 / B站 / 小红书的爆款标题',
  },
  {
    icon: '🔒',
    title: '卡密即用，无需注册',
    desc: '输入卡密即可使用，不收集任何个人信息，历史记录仅保存在本地',
  },
]

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
      show('请输入卡密', 'error')
      return
    }
    setLoading(true)
    try {
      const data = await verifyCard(trimmed)
      login(data)
      show('卡密验证成功，开始使用吧！', 'success')
      navigate('/storyboard')
    } catch (err) {
      show(err.message || '卡密验证失败，请检查后重试', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 px-6 py-12 text-center text-white shadow-lg sm:py-16">
        <h1 className="text-2xl font-bold sm:text-4xl">
          让 AI 帮你把想法变成短视频脚本
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-blue-100 sm:text-base">
          文案一键拆分镜 · 爆款标题一键生成
          <br className="sm:hidden" />
          面向短视频创作者的轻量创作工具箱
        </p>

        {/* 卡密输入 */}
        <form onSubmit={handleVerify} className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="请输入卡密，如 SP-A3K9M2X7P5Q1"
            className="w-full flex-1 rounded-xl border-0 bg-white/95 px-4 py-3 text-center text-sm text-gray-900 placeholder-gray-400 outline-none ring-2 ring-white/30 focus:ring-white sm:text-left"
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                  style={{ animation: 'spin 0.8s linear infinite' }}
                />
                验证中…
              </span>
            ) : (
              '立即激活'
            )}
          </button>
        </form>
        <p className="mt-3 text-xs text-blue-200">
          卡密由管理员发放，激活后即可使用全部功能
        </p>
      </section>

      {/* 功能卡片 */}
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-3xl">{f.icon}</div>
            <h3 className="mt-3 font-semibold text-gray-900">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* 使用步骤 */}
      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">如何使用</h2>
        <ol className="mt-4 grid gap-4 text-sm text-gray-600 sm:grid-cols-3">
          <li className="rounded-lg bg-gray-50 p-4">
            <span className="font-semibold text-blue-600">第 1 步</span>
            <p className="mt-1">在上方输入框粘贴卡密，点击「立即激活」</p>
          </li>
          <li className="rounded-lg bg-gray-50 p-4">
            <span className="font-semibold text-blue-600">第 2 步</span>
            <p className="mt-1">选择「分镜拆解」或「标题生成」，输入内容开始创作</p>
          </li>
          <li className="rounded-lg bg-gray-50 p-4">
            <span className="font-semibold text-blue-600">第 3 步</span>
            <p className="mt-1">生成结果自动保存到「历史记录」，随时回看</p>
          </li>
        </ol>
      </section>
    </div>
  )
}
