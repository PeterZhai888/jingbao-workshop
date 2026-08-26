import { useState } from 'react'
import { generateTitles } from '../api/client.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../components/Toast.jsx'
import Spinner from '../components/Spinner.jsx'

const PLATFORMS = ['抖音', 'B站', '小红书']

export default function Titles() {
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [titles, setTitles] = useState(null)
  const { refreshUsage } = useSession()
  const { show } = useToast()

  async function handleGenerate() {
    const t = topic.trim()
    if (t.length < 2) {
      show('请输入视频主题，至少 2 个字', 'error')
      return
    }
    if (t.length > 200) {
      show('主题内容过长，请精简后重试', 'error')
      return
    }
    setLoading(true)
    setTitles(null)
    try {
      const result = await generateTitles(t)
      setTitles(result.titles)
      if (result.usage) refreshUsage(result.usage)
      show('爆款标题生成成功！', 'success')
    } catch (err) {
      show(err.message || 'AI 服务繁忙，请稍后再试', 'error')
    } finally {
      setLoading(false)
    }
  }

  function copyOne(title) {
    navigator.clipboard
      .writeText(title)
      .then(() => show('已复制', 'success', 1500))
      .catch(() => show('复制失败，请手动选择复制', 'error'))
  }

  function copyAll() {
    navigator.clipboard
      .writeText(titles.map((t, i) => `${i + 1}. ${t}`).join('\n'))
      .then(() => show('已复制全部标题', 'success'))
      .catch(() => show('复制失败，请手动选择复制', 'error'))
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
        ✨ AI 爆款标题生成
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        输入视频主题，一次生成 10 组适配 {PLATFORMS.join(' / ')} 的爆款标题
      </p>

      {/* 输入区 */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <label className="text-sm font-medium text-gray-700">
          视频主题 / 核心内容
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            maxLength={200}
            placeholder="例如：新手健身增肌饮食怎么安排"
            className="w-full flex-1 rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '生成中…' : '生成标题'}
          </button>
        </div>
      </div>

      {/* 加载中 */}
      {loading && <Spinner text="AI 正在构思爆款标题…" />}

      {/* 空占位 */}
      {!loading && titles === null && (
        <div className="mt-6 rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          生成的 10 组爆款标题将展示在这里
        </div>
      )}

      {/* 结果列表 */}
      {titles && (
        <div className="animate-fade-in mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              生成结果（{titles.length} 组）
            </h2>
            <button
              onClick={copyAll}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
            >
              📋 复制全部
            </button>
          </div>

          <div className="grid gap-2">
            {titles.map((t, i) => (
              <button
                key={i}
                onClick={() => copyOne(t)}
                title="点击复制"
                className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm leading-relaxed text-gray-800">{t}</span>
                <span className="shrink-0 text-xs text-gray-300 group-hover:text-blue-500">
                  点击复制
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
