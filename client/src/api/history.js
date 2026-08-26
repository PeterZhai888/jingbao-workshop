const HISTORY_KEY = 'ai_video_history'
const MAX_ITEMS = 200

/** 历史记录存于本地 localStorage（阶段1），阶段2 起同步后端 */
export function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []
  } catch {
    return []
  }
}

export function saveHistory(item) {
  const list = getHistory()
  list.unshift({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), createdAt: Date.now(), ...item })
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)))
}

/** 一键清空当前会话全部本地历史 */
export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY)
}
