import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const SessionContext = createContext(null)

const STORAGE_KEY = 'ai_video_session'

/**
 * 会话上下文：保存卡密验证后的 Token 与卡密信息。
 * Token 有效期 24 小时，到期自动清理本地会话。
 */
export function SessionProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      if (data.expiresAt && Date.now() > data.expiresAt) {
        localStorage.removeItem(STORAGE_KEY)
        return null
      }
      return data
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [session])

  const login = useCallback((data) => {
    setSession({
      token: data.token,
      cardCode: data.card?.code,
      cardType: data.card?.type, // 'subscription' | 'trial'
      dailyLimit: data.card?.dailyLimit,
      usedToday: data.card?.usedToday,
      remainingTrials: data.card?.remainingTrials,
      expiresAt: data.tokenExpiresAt,
    })
  }, [])

  const logout = useCallback(() => setSession(null), [])

  /** 每次生成成功后更新剩余次数 */
  const refreshUsage = useCallback((usage) => {
    setSession((s) =>
      s
        ? {
            ...s,
            usedToday: usage.usedToday,
            remainingTrials: usage.remainingTrials,
          }
        : s,
    )
  }, [])

  return (
    <SessionContext.Provider value={{ session, login, logout, refreshUsage }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  return useContext(SessionContext)
}
