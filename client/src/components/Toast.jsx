import { createContext, useCallback, useContext, useState } from 'react'

const ToastContext = createContext(null)

let toastId = 0

/** 全局轻提示：成功 / 错误反馈 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message, type = 'error', duration = 3500) => {
      const id = ++toastId
      setToasts((list) => [...list, { id, message, type }])
      setTimeout(() => remove(id), duration)
    },
    [remove],
  )

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-fade-in pointer-events-auto w-full max-w-sm rounded-lg px-4 py-2.5 text-center text-sm shadow-sm ${
              t.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-gray-900 text-white'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
