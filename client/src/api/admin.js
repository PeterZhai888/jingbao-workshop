/**
 * 管理后台 API 客户端（Token 存 localStorage，24 小时有效期）
 */
const TOKEN_KEY = 'ai_video_admin_token'

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAdminToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': getAdminToken() || '',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    clearAdminToken()
  }
  if (!res.ok) throw new Error(data.message || `请求失败（${res.status}）`)
  return data
}

export const adminApi = {
  captcha: () => request('/captcha'),
  login: (payload) => request('/login', { method: 'POST', body: payload }),
  logout: () => request('/logout', { method: 'POST' }),
  stats: () => request('/stats'),
  cards: (params = '') => request(`/cards${params}`),
  generateCards: (payload) => request('/cards/generate', { method: 'POST', body: payload }),
  cardStatus: (code, action) =>
    request(`/cards/${code}/status`, { method: 'POST', body: { action } }),
  exportUrl: () => '/api/admin/cards/export',
  logs: (params = '') => request(`/logs${params}`),
  settings: () => request('/settings'),
  saveSettings: (payload) => request('/settings', { method: 'POST', body: payload }),
  changePassword: (payload) => request('/password', { method: 'POST', body: payload }),
}
