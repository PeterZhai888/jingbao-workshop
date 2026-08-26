import { useState } from 'react'
import { getHistory, clearHistory } from '../api/client.js'
import { useToast } from '../components/Toast.jsx'

function formatTime(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function History() {
  const [items, setItems] = useState(getHistory)
  const [confirming, setConfirming] = useState(false)
  const { show } = useToast()

  function handleClear() {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
      return
    }
    clearHistory()
    setItems([])
    setConfirming(false)
    show('历史记录已清空', 'success')
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            📋 历史记录
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            共 {items.length} 条记录，仅保存在本地浏览器
          </p>
        </div>

        {items.length > 0 && (
          <button
            onClick={handleClear}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              confirming
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
            }`}
          >
            {confirming ? '确认清空？' : '🗑 一键清空'}
          </button>
        )}
      </div>

      {/* 空状态 */}
      {items.length === 0 && (
        <div className="mt-8 rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <div className="text-4xl">📭</div>
          <p className="mt-3 text-sm text-gray-400">
            还没有生成记录，去「分镜拆解」或「标题生成」试试吧
          </p>
        </div>
      )}

      {/* 记录列表 */}
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <details
            key={item.id}
            className="group rounded-xl border border-gray-200 bg-white shadow-sm"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  item.type === 'storyboard'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-purple-50 text-purple-600'
                }`}
              >
                {item.type === 'storyboard' ? '分镜拆解' : '标题生成'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                {item.input || '（无输入内容）'}
              </span>
              <span className="shrink-0 text-xs text-gray-400">
                {formatTime(item.createdAt)}
              </span>
              <span className="shrink-0 text-gray-400 transition group-open:rotate-180">
                ▾
              </span>
            </summary>

            <div className="border-t border-gray-100 p-4">
              {item.type === 'storyboard' ? (
                <div className="space-y-2">
                  {item.output.map((s) => (
                    <div key={s.index} className="rounded-lg bg-gray-50 p-3 text-sm">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span className="font-bold text-blue-600">镜头 #{s.index}</span>
                        <span>
                          {s.duration} · {s.camera}
                        </span>
                      </div>
                      <p className="mt-1 text-gray-700">{s.visual}</p>
                      <p className="mt-1 text-gray-600">🎙 {s.narration}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <ol className="space-y-1.5">
                  {item.output.map((t, i) => (
                    <li key={i} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      <span className="mr-2 font-bold text-purple-500">{i + 1}.</span>
                      {t}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
