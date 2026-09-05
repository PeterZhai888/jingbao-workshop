import { useState } from 'react'
import { generateStoryboard } from '../api/client.js'
import { useSession } from '../context/SessionContext.jsx'
import { useToast } from '../components/Toast.jsx'
import Spinner from '../components/Spinner.jsx'

export default function Storyboard() {
  const [text, setText] = useState('')
  const [count, setCount] = useState(6)
  const [loading, setLoading] = useState(false)
  const [shots, setShots] = useState(null)
  const { refreshUsage } = useSession()
  const { show } = useToast()

  async function handleGenerate() {
    const content = text.trim()
    if (content.length < 10) {
      show('文案内容太短，至少输入 10 个字')
      return
    }
    if (content.length > 5000) {
      show('文案内容过长，请控制在 5000 字以内')
      return
    }
    setLoading(true)
    setShots(null)
    try {
      const result = await generateStoryboard(content, count)
      setShots(result.shots)
      if (result.usage) refreshUsage(result.usage)
    } catch (err) {
      show(err.message || 'AI 服务繁忙，请稍后再试')
    } finally {
      setLoading(false)
    }
  }

  function copyTable() {
    const lines = ['镜头\t画面描述\t台词/旁白\t预估时长\t运镜建议']
    shots.forEach((s) =>
      lines.push([s.index, s.visual, s.narration, s.duration, s.camera].join('\t')),
    )
    navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => show('已复制，可直接粘贴到 Excel / 文档', 'success'))
      .catch(() => show('复制失败，请手动选择复制'))
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-lg font-semibold tracking-tight text-gray-900">文案分镜拆解</h1>

      <div className="mt-6">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          maxLength={5000}
          placeholder="粘贴视频文案或故事文本，AI 拆解为可拍摄的分镜脚本…"
          className="w-full resize-y rounded-lg border border-gray-300 bg-white p-4 text-sm leading-relaxed outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
        />
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              分镜数量 <span className="font-medium text-gray-900">{count}</span>
            </span>
            <input
              type="range"
              min={3}
              max={15}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-36 accent-blue-600 sm:w-44"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="h-10 rounded-lg bg-blue-600 px-8 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? '生成中…' : '开始拆解'}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">{text.length} / 5000 字</p>
      </div>

      {loading && <Spinner text="AI 正在拆解分镜，约需 10~30 秒…" />}

      {!loading && shots === null && (
        <div className="mt-10 rounded-lg border border-dashed border-gray-200 py-14 text-center text-sm text-gray-400">
          分镜脚本将展示在这里
        </div>
      )}

      {shots && (
        <div className="animate-fade-in mt-8">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-gray-500">共 {shots.length} 条</span>
            <button
              onClick={copyTable}
              className="text-sm text-gray-500 underline-offset-4 transition-colors hover:text-blue-600 hover:underline"
            >
              复制全部
            </button>
          </div>

          {/* 桌面端表格 */}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">镜头</th>
                  <th className="px-4 py-2.5 font-medium">画面描述</th>
                  <th className="px-4 py-2.5 font-medium">台词 / 旁白</th>
                  <th className="px-4 py-2.5 font-medium">时长</th>
                  <th className="px-4 py-2.5 font-medium">运镜</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shots.map((s) => (
                  <tr key={s.index} className="align-top">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.index}</td>
                    <td className="px-4 py-3 text-gray-700">{s.visual}</td>
                    <td className="px-4 py-3 text-gray-600">{s.narration}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{s.duration}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{s.camera}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 移动端卡片 */}
          <div className="space-y-3 md:hidden">
            {shots.map((s) => (
              <div key={s.index} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span className="font-medium text-gray-900">镜头 {s.index}</span>
                  <span>{s.duration} · {s.camera}</span>
                </div>
                <p className="mt-2 break-words text-sm text-gray-700">{s.visual}</p>
                <p className="mt-2 break-words text-sm text-gray-600">{s.narration}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
