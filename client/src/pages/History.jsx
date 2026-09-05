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
        <h1 className="text-lg font-semibold tracking-tight text-gray-900">
          历史记录
          <span className="ml-2 text-sm font-normal text-gray-400">{items.length} 条</span>
        </h1>

        {items.length > 0 && (
          <button
            onClick={handleClear}
            className={`text-sm underline-offset-4 transition-colors ${
              confirming
                ? 'font-medium text-red-600'
                : 'text-gray-400 hover:text-red-600 hover:underline'
            }`}
          >
            {confirming ? '确认清空？' : '清空记录'}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-400">仅保存在本地浏览器</p>

      {items.length === 0 && (
        <div className="mt-10 rounded-lg border border-dashed border-gray-200 py-14 text-center text-sm text-gray-400">
          暂无记录，去生成一条吧
        </div>
      )}

      <div className="mt-6 divide-y divide-gray-100 border-y border-gray-200">
        {items.map((item) => (
          <details key={item.id} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-4 py-3.5 transition-colors hover:bg-gray-50">
              <span
                className={`shrink-0 text-xs ${
                  item.type === 'storyboard' ? 'text-gray-600' : 'text-gray-600'
                }`}
              >
                {item.type === 'storyboard' ? '分镜' : '标题'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                {item.input || '（无输入内容）'}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-gray-400">
                {formatTime(item.createdAt)}
              </span>
              <span className="shrink-0 text-xs text-gray-300 transition group-open:rotate-180">
                ▾
              </span>
            </summary>

            <div className="pb-4 pl-9 pr-4">
              {item.type === 'storyboard' ? (
                <div className="space-y-2">
                  {item.output.map((s) => (
                    <div key={s.index} className="text-sm">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>镜头 {s.index}</span>
                        <span>{s.duration} · {s.camera}</span>
                      </div>
                      <p className="mt-0.5 break-words text-gray-700">{s.visual}</p>
                      <p className="mt-0.5 break-words text-gray-600">{s.narration}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <ol className="space-y-1">
                  {item.output.map((t, i) => (
                    <li key={i} className="break-words text-sm text-gray-700">
                      <span className="mr-2 tabular-nums text-gray-300">{i + 1}.</span>
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
