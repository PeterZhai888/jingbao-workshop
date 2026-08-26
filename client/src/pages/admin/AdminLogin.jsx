import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi, setAdminToken, getAdminToken } from '../../api/admin.js'

export default function AdminLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [captchaText, setCaptchaText] = useState('')
  const [captcha, setCaptcha] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (getAdminToken()) navigate('/admin', { replace: true })
    refreshCaptcha()
  }, [])

  async function refreshCaptcha() {
    try {
      setCaptcha(await adminApi.captcha())
    } catch {
      setError('无法获取验证码，请检查后端服务')
    }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    if (!username || !password || !captchaText) {
      setError('请填写完整')
      return
    }
    setLoading(true)
    try {
      const data = await adminApi.login({
        username,
        password,
        captchaId: captcha.captchaId,
        captchaText,
      })
      setAdminToken(data.adminToken)
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err.message)
      setCaptchaText('')
      refreshCaptcha()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-lg"
      >
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-2xl text-white">
            🔐
          </span>
          <h1 className="mt-4 text-xl font-bold text-gray-900">管理后台登录</h1>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="admin"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">验证码</label>
            <div className="mt-1 flex gap-2">
              <input
                value={captchaText}
                onChange={(e) => setCaptchaText(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="输入右侧字符"
                maxLength={4}
              />
              {captcha ? (
                <button
                  type="button"
                  onClick={refreshCaptcha}
                  title="点击刷新"
                  dangerouslySetInnerHTML={{ __html: captcha.svg }}
                  className="shrink-0 overflow-hidden rounded-lg border border-gray-200"
                />
              ) : (
                <div className="h-[50px] w-[130px] animate-pulse rounded-lg bg-gray-100" />
              )}
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? '登录中…' : '登 录'}
        </button>

        <p className="mt-4 text-center text-xs text-gray-400">
          连续错误 5 次将锁定 IP 30 分钟
        </p>
      </form>
    </div>
  )
}
