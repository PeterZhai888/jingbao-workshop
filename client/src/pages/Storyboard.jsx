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
  const { session, refreshUsage } = useSession()
  const { show } = useToast()

  async function handleGenerate() {
    const content = text.trim()
    if (content.length < 10) {
      show('文案内容太短啦，至少输入 10 个字', 'error')
      return
    }
    if (content.length > 5000) {
      show('文案内容过长，请控制在 5000 字以内', 'error')
      return
    }
    setLoading(true)
    setShots(null)
    try {
      const result = await generateStoryboard(content, count)
      setShots(result.shots)
      if (result.usage) refreshUsage(result.usage)
      show('分镜脚本生成成功！', 'success')
    } catch (err) {
      show(err.message || 'AI 服务繁忙，请稍后再试', 'error')
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
      .then(() => show('已复制到剪贴板（可直接粘贴到 Excel/文档）', 'success'))
      .catch(() => show('复制失败，请手动选择复制', 'error'))
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            🎬 AI 文案分镜拆解
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            粘贴视频文案，AI 自动拆解为可直接拍摄的分镜脚本
          </p>
        </div>
      </div>

      {/* 输入区 */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <label className="text-sm font-medium text-gray-700">
          视频文案 / 故事文本
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          maxLength={5000}
          placeholder="在这里粘贴你的视频文案或故事文本…&#10;&#10;示例：很多人早上起床第一件事就是刷手机，其实这个习惯正在悄悄偷走你的时间……"
          className="mt-2 w-full resize-y rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm leading-relaxed outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
          <span>{text.length} / 5000 字</span>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700">
              分镜数量：<span className="font-bold text-blue-600">{count} 条</span>
            </label>
            <input
              type="range"
              min={3}
              max={15}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="mt-2 w-48 accent-blue-600 sm:w-64"
            />
            <div className="mt-1 flex w-48 justify-between text-xs text-gray-400 sm:w-64">
              <span>3</span>
              <span>15</span>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '生成中…' : '开始拆解'}
          </button>
        </div>
      </div>

      {/* 加载中 */}
      {loading && <Spinner text="AI 正在拆解分镜，约需 10~30 秒…" />}

      {/* 错误占位 */}
      {!loading && shots === null && (
        <div className="mt-6 rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          生成的分镜脚本将展示在这里
        </div>
      )}

      {/* 结果表格 */}
      {shots && (
        <div className="animate-fade-in mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              分镜脚本（共 {shots.length} 条）
            </h2>
            <button
              onClick={copyTable}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
            >
              📋 复制全部
            </button>
          </div>

          {/* 桌面端表格 */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-3">镜头</th>
                  <th className="px-3 py-3">画面描述</th>
                  <th className="px-3 py-3">台词 / 旁白</th>
                  <th className="px-3 py-3 whitespace-nowrap">预估时长</th>
                  <th className="px-3 py-3 whitespace-nowrap">运镜建议</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shots.map((s) => (
                  <tr key={s.index} className="align-top hover:bg-blue-50/30">
                    <td className="px-3 py-3 font-bold text-blue-600">#{s.index}</td>
                    <td className="px-3 py-3 text-gray-700">{s.visual}</td>
                    <td className="px-3 py-3 text-gray-600">{s.narration}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-gray-600">{s.duration}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-gray-600">{s.camera}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 移动端卡片 */}
          <div className="space-y-3 md:hidden">
            {shots.map((s) => (
              <div key={s.index} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-600">
                    镜头 #{s.index}
                  </span>
                  <span className="text-xs text-gray-400">
                    {s.duration} · {s.camera}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-700">{s.visual}</p>
                <p className="mt-2 rounded-lg bg-gray-50 p-2 text-sm text-gray-600">
                  🎙 {s.narration}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
