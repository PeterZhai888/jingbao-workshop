import { useState } from 'react'
import { generateTitles } from '../api/client.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../components/Toast.jsx'
import Spinner from '../components/Spinner.jsx'

export default function Titles() {
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [titles, setTitles] = useState(null)
  const { refreshUsage } = useSession()
  const { show } = useToast()

  async function handleGenerate() {
    const t = topic.trim()
    if (t.length < 2) {
      show('请输入视频主题，至少 2 个字')
      return
    }
    if (t.length > 200) {
      show('主题内容过长，请精简后重试')
      return
    }
    setLoading(true)
    setTitles(null)
    try {
      const result = await generateTitles(t)
      setTitles(result.titles)
      if (result.usage) refreshUsage(result.usage)
    } catch (err) {
      show(err.message || 'AI 服务繁忙，请稍后再试')
    } finally {
      setLoading(false)
    }
  }

  function copyOne(title) {
    navigator.clipboard
      .writeText(title)
      .then(() => show('已复制', 'success', 1500))
      .catch(() => show('复制失败，请手动选择复制'))
  }

  function copyAll() {
    navigator.clipboard
      .writeText(titles.map((t, i) => `${i + 1}. ${t}`).join('\n'))
      .then(() => show('已复制全部标题', 'success'))
      .catch(() => show('复制失败，请手动选择复制'))
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-lg font-semibold tracking-tight text-gray-900">爆款标题生成</h1>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          maxLength={200}
          placeholder="视频主题，如：新手健身增肌饮食怎么安排"
          className="h-11 w-full flex-1 rounded-lg border border-gray-300 bg-white px-4 text-sm outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
        />
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="h-11 shrink-0 rounded-lg bg-blue-600 px-8 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? '生成中…' : '生成标题'}
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-400">一次生成 10 组，适配抖音 / B站 / 小红书</p>

      {loading && <Spinner text="AI 正在构思爆款标题…" />}

      {!loading && titles === null && (
        <div className="mt-10 rounded-lg border border-dashed border-gray-200 py-14 text-center text-sm text-gray-400">
          生成的标题将展示在这里
        </div>
      )}

      {titles && (
        <div className="animate-fade-in mt-8">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-gray-500">共 {titles.length} 组</span>
            <button
              onClick={copyAll}
              className="text-sm text-gray-500 underline-offset-4 transition-colors hover:text-blue-600 hover:underline"
            >
              复制全部
            </button>
          </div>

          <div className="divide-y divide-gray-100 border-y border-gray-200">
            {titles.map((t, i) => (
              <button
                key={i}
                onClick={() => copyOne(t)}
                title="点击复制"
                className="group flex w-full items-baseline gap-4 py-3.5 text-left transition-colors hover:bg-gray-50"
              >
                <span className="w-5 shrink-0 text-right text-sm tabular-nums text-gray-300 group-hover:text-gray-400">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm leading-relaxed text-gray-800">{t}</span>
                <span className="shrink-0 text-xs text-gray-300 opacity-0 transition-opacity group-hover:opacity-100">
                  复制
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
