/** 通用加载动画 + 提示文案 */
export default function Spinner({ text = 'AI 正在生成中…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <div
        className="h-10 w-10 rounded-full border-4 border-blue-100 border-t-blue-600"
        style={{ animation: 'spin 0.8s linear infinite' }}
      />
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  )
}
