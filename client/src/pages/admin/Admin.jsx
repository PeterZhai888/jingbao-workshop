import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminApi, clearAdminToken, getAdminToken } from '../../api/admin.js'

/* ---------------- 通用小组件 ---------------- */

const STATUS_TEXT = {
  unused: ['未使用', 'bg-gray-100 text-gray-600'],
  active: ['使用中', 'bg-green-50 text-green-600'],
  frozen: ['已冻结', 'bg-amber-50 text-amber-600'],
  revoked: ['已作废', 'bg-red-50 text-red-600'],
  exhausted: ['已耗尽', 'bg-gray-100 text-gray-500'],
  expired: ['已过期', 'bg-gray-100 text-gray-500'],
}

function StatusBadge({ status }) {
  const [text, cls] = STATUS_TEXT[status] || [status, 'bg-gray-100 text-gray-600']
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{text}</span>
}

const inputCls =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

/* ---------------- 卡密管理面板 ---------------- */

function CardsPanel({ showToast }) {
  const [cards, setCards] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(null)
  const [genForm, setGenForm] = useState({ type: 'subscription', durationMonths: 1, trialQuota: 5, count: 10 })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, pageSize: 20 })
      if (status) params.set('status', status)
      if (keyword) params.set('keyword', keyword)
      const data = await adminApi.cards('?' + params.toString())
      setCards(data.cards)
      setTotal(data.total)
    } catch (err) {
      showToast(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, status, keyword])

  useEffect(() => {
    load()
  }, [load])

  async function handleGenerate() {
    try {
      const payload =
        genForm.type === 'subscription'
          ? { type: 'subscription', durationMonths: genForm.durationMonths, count: genForm.count }
          : { type: 'trial', trialQuota: genForm.trialQuota, count: genForm.count }
      const data = await adminApi.generateCards(payload)
      setGenerated(data.codes)
      showToast(`已生成 ${data.codes.length} 张卡密`, 'success')
      load()
    } catch (err) {
      showToast(err.message)
    }
  }

  async function handleAction(code, action, label) {
    if (!confirm(`确认${label}卡密 ${code}？`)) return
    try {
      await adminApi.cardStatus(code, action)
      showToast(`已${label}`, 'success')
      load()
    } catch (err) {
      showToast(err.message)
    }
  }

  function copyCodes() {
    navigator.clipboard
      .writeText(generated.join('\n'))
      .then(() => showToast('已复制全部卡密', 'success'))
      .catch(() => showToast('复制失败', undefined))
  }

  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <div className="space-y-6">
      {/* 生成卡密 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900">批量生成卡密</h3>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-gray-500">类型</label>
            <select
              value={genForm.type}
              onChange={(e) => setGenForm({ ...genForm, type: e.target.value })}
              className={`${inputCls} mt-1 block`}
            >
              <option value="subscription">付费订阅卡</option>
              <option value="trial">免费试用卡</option>
            </select>
          </div>
          {genForm.type === 'subscription' ? (
            <div>
              <label className="text-xs text-gray-500">有效期</label>
              <select
                value={genForm.durationMonths}
                onChange={(e) => setGenForm({ ...genForm, durationMonths: Number(e.target.value) })}
                className={`${inputCls} mt-1 block`}
              >
                <option value={1}>1 个月</option>
                <option value={3}>3 个月</option>
                <option value={6}>6 个月</option>
                <option value={12}>12 个月</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-500">可用次数</label>
              <select
                value={genForm.trialQuota}
                onChange={(e) => setGenForm({ ...genForm, trialQuota: Number(e.target.value) })}
                className={`${inputCls} mt-1 block`}
              >
                <option value={5}>5 次</option>
                <option value={10}>10 次</option>
                <option value={20}>20 次</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500">数量</label>
            <input
              type="number"
              min={1}
              max={500}
              value={genForm.count}
              onChange={(e) => setGenForm({ ...genForm, count: Number(e.target.value) })}
              className={`${inputCls} mt-1 block w-24`}
            />
          </div>
          <button
            onClick={handleGenerate}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            生成
          </button>
        </div>

        {generated && (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-800">
                新卡密（{generated.length} 张）
              </span>
              <button onClick={copyCodes} className="text-xs font-medium text-blue-600 hover:underline">
                复制全部
              </button>
            </div>
            <div className="mt-2 grid gap-1 font-mono text-sm text-blue-900 sm:grid-cols-2 lg:grid-cols-3">
              {generated.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 卡密列表 */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-4">
          <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value) }} className={inputCls}>
            <option value="">全部状态</option>
            <option value="unused">未使用</option>
            <option value="active">使用中</option>
            <option value="frozen">已冻结</option>
            <option value="revoked">已作废</option>
            <option value="exhausted">已耗尽</option>
            <option value="expired">已过期</option>
          </select>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
            placeholder="搜索卡密…"
            className={`${inputCls} flex-1 sm:max-w-xs`}
          />
          <button onClick={() => { setPage(1); load() }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
            搜索
          </button>
          <a
            href={adminApi.exportUrl()}
            className="ml-auto rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            导出 CSV
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3">卡密</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3 whitespace-nowrap">今日/累计</th>
                <th className="px-4 py-3 whitespace-nowrap">到期时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">加载中…</td></tr>
              ) : cards.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">暂无卡密</td></tr>
              ) : (
                cards.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono">{c.code}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.type === 'subscription' ? `订阅 ${c.duration_months} 月` : `试用 ${c.trial_quota} 次`}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {c.used_today} / {c.total_used}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{c.expires_at || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 text-xs">
                        {c.status !== 'revoked' && (
                          <button onClick={() => handleAction(c.code, 'revoke', '作废')} className="text-red-600 hover:underline">
                            作废
                          </button>
                        )}
                        {c.status === 'frozen' ? (
                          <button onClick={() => handleAction(c.code, 'unfreeze', '解冻')} className="text-green-600 hover:underline">
                            解冻
                          </button>
                        ) : c.status !== 'revoked' && (
                          <button onClick={() => handleAction(c.code, 'freeze', '冻结')} className="text-amber-600 hover:underline">
                            冻结
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
          <span>共 {total} 张</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded border border-gray-200 px-3 py-1 disabled:opacity-40"
            >
              上一页
            </button>
            <span className="px-2 py-1">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded border border-gray-200 px-3 py-1 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 使用记录面板 ---------------- */

function LogsPanel({ showToast }) {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [keyword, setKeyword] = useState('')

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page, pageSize: 30 })
      if (action) params.set('action', action)
      if (keyword) params.set('keyword', keyword)
      const data = await adminApi.logs('?' + params.toString())
      setLogs(data.logs)
      setTotal(data.total)
    } catch (err) {
      showToast(err.message)
    }
  }, [page, action, keyword])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / 30))
  const ACTION_TEXT = {
    verify: '验证成功', verify_failed: '验证失败', generate: 'AI 生成',
    rate_limit_block: '触发限流', admin_login: '后台登录', admin_login_locked: '登录锁定',
    admin_generate: '生成卡密', admin_revoke: '作废卡密', admin_freeze: '冻结卡密',
    admin_unfreeze: '解冻卡密', admin_settings: '修改配置', admin_password: '修改密码',
    sensitive_input_blocked: '敏感词拦截', sensitive_output_blocked: '输出拦截',
    admin_logout: '后台登出',
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-4">
        <select value={action} onChange={(e) => { setPage(1); setAction(e.target.value) }} className={inputCls}>
          <option value="">全部操作</option>
          {Object.entries(ACTION_TEXT).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
          placeholder="搜索卡密…"
          className={`${inputCls} flex-1 sm:max-w-xs`}
        />
        <button onClick={() => { setPage(1); load() }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
          搜索
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3">时间 (UTC)</th>
              <th className="px-4 py-3">操作</th>
              <th className="px-4 py-3">卡密</th>
              <th className="px-4 py-3">详情</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">暂无记录</td></tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">{l.created_at}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      l.action.includes('blocked') || l.action.includes('locked') || l.action === 'verify_failed'
                        ? 'bg-red-50 text-red-600'
                        : l.action.startsWith('admin')
                          ? 'bg-purple-50 text-purple-600'
                          : 'bg-blue-50 text-blue-600'
                    }`}>
                      {ACTION_TEXT[l.action] || l.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{l.card_code || '—'}</td>
                  <td className="max-w-[240px] truncate px-4 py-2.5 text-gray-600">{l.detail || '—'}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">{l.ip || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
        <span>共 {total} 条</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-gray-200 px-3 py-1 disabled:opacity-40">上一页</button>
          <span className="px-2 py-1">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded border border-gray-200 px-3 py-1 disabled:opacity-40">下一页</button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 系统配置面板 ---------------- */

function SettingsPanel({ showToast }) {
  const [settings, setSettings] = useState(null)
  const [keys, setKeys] = useState({})
  const [saving, setSaving] = useState(false)
  const [pwd, setPwd] = useState({ oldPassword: '', newPassword: '' })

  useEffect(() => {
    adminApi.settings().then(setSettings).catch((e) => showToast(e.message))
  }, [])

  if (!settings) {
    return <div className="py-12 text-center text-sm text-gray-400">配置加载中…</div>
  }

  async function save(payload) {
    setSaving(true)
    try {
      await adminApi.saveSettings(payload)
      const fresh = await adminApi.settings()
      setSettings(fresh)
      setKeys({})
      showToast('配置已保存', 'success')
    } catch (err) {
      showToast(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function changePassword() {
    if (pwd.newPassword.length < 8) {
      showToast('新密码至少 8 位')
      return
    }
    try {
      await adminApi.changePassword(pwd)
      setPwd({ oldPassword: '', newPassword: '' })
      showToast('密码已修改', 'success')
    } catch (err) {
      showToast(err.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* 基础参数 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900">基础参数</h3>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs text-gray-500">每日生成次数上限（付费卡）</label>
            <input
              type="number"
              min={1}
              max={10000}
              defaultValue={settings.dailyLimit}
              onBlur={(e) =>
                Number(e.target.value) !== settings.dailyLimit &&
                save({ dailyLimit: Number(e.target.value) })
              }
              className={`${inputCls} mt-1 block w-36`}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">AI 全局 QPS 上限</label>
            <input
              type="number"
              min={1}
              max={50}
              defaultValue={settings.aiQps}
              onBlur={(e) =>
                Number(e.target.value) !== settings.aiQps &&
                save({ aiQps: Number(e.target.value) })
              }
              className={`${inputCls} mt-1 block w-36`}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-400">输入框失焦后自动保存</p>
      </div>

      {/* AI 接口配置 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">AI 接口配置</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">当前生效</label>
            <select
              value={settings.aiProvider}
              onChange={(e) => save({ aiProvider: e.target.value })}
              className={inputCls}
            >
              {Object.entries(settings.providers).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.name}
                  {p.hasKey ? '' : '（未配置密钥）'}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {Object.entries(settings.providers).map(([id, p]) => (
            <div key={id} className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-3">
              <div className="w-36">
                <div className="text-sm font-medium text-gray-800">
                  {p.name}
                  {settings.aiProvider === id && (
                    <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">生效中</span>
                  )}
                </div>
                <div className="text-xs text-gray-400">{p.baseUrl}</div>
              </div>
              <input
                type="password"
                placeholder={p.hasKey ? '已配置（输入可覆盖）' : '粘贴 API Key'}
                value={keys[id]?.apiKey || ''}
                onChange={(e) => setKeys({ ...keys, [id]: { ...(keys[id] || {}), apiKey: e.target.value } })}
                className={`${inputCls} min-w-40 flex-1`}
                autoComplete="new-password"
              />
              <input
                placeholder="模型名"
                defaultValue={p.model}
                onBlur={(e) => e.target.value !== p.model && save({ providerKeys: { [id]: { model: e.target.value } } })}
                className={`${inputCls} w-44`}
              />
              <button
                onClick={() => save({ providerKeys: { [id]: { apiKey: keys[id]?.apiKey || '' } } })}
                disabled={!keys[id]?.apiKey || saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                保存密钥
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          六家厂商均为 OpenAI 兼容协议，仅需 API Key 即可切换。未配置密钥时生成接口返回演示数据。
        </p>
      </div>

      {/* 敏感词库 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900">敏感词库</h3>
        <p className="mt-1 text-xs text-gray-400">每行一个词，用户输入与 AI 输出命中即拦截（不区分大小写）</p>
        <textarea
          defaultValue={settings.sensitiveWords}
          onBlur={(e) => e.target.value !== settings.sensitiveWords && save({ sensitiveWords: e.target.value })}
          rows={6}
          placeholder={'示例：\n违规词1\n违规词2'}
          className="mt-2 w-full rounded-lg border border-gray-300 p-3 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <p className="mt-1 text-xs text-gray-400">失焦自动保存</p>
      </div>

      {/* 修改密码 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900">修改管理员密码</h3>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <input
            type="password"
            placeholder="原密码"
            value={pwd.oldPassword}
            onChange={(e) => setPwd({ ...pwd, oldPassword: e.target.value })}
            className={inputCls}
            autoComplete="current-password"
          />
          <input
            type="password"
            placeholder="新密码（至少 8 位）"
            value={pwd.newPassword}
            onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })}
            className={inputCls}
            autoComplete="new-password"
          />
          <button onClick={changePassword} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            修改密码
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 主面板 ---------------- */

const TABS = [
  { id: 'cards', label: '🎫 卡密管理' },
  { id: 'logs', label: '📊 使用记录' },
  { id: 'settings', label: '⚙️ 系统配置' },
]

export default function Admin() {
  const [tab, setTab] = useState('cards')
  const [stats, setStats] = useState(null)
  const [toast, setToast] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!getAdminToken()) {
      navigate('/admin/login', { replace: true })
      return
    }
    adminApi.stats().then(setStats).catch((e) => {
      // 401 时 api 层已清除 token
      navigate('/admin/login', { replace: true })
    })
  }, [])

  const showToast = (message, type = 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function logout() {
    try { await adminApi.logout() } catch { /* 忽略 */ }
    clearAdminToken()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="animate-fade-in">
      {/* 顶部 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">管理后台</h1>
          {stats && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">卡密总数 {stats.totalCards}</span>
              <span className="rounded-full bg-green-50 px-3 py-1 text-green-600">可用 {stats.activeCards}</span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-600">今日生成 {stats.todayGenerations}</span>
              <span className="rounded-full bg-red-50 px-3 py-1 text-red-600">今日验证失败 {stats.todayVerifyFails}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Link to="/" className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            前台首页
          </Link>
          <button onClick={logout} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800">
            退出登录
          </button>
        </div>
      </div>

      {/* 标签页 */}
      <div className="mt-5 flex gap-1 rounded-xl border border-gray-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none sm:px-5 ${
              tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'cards' && <CardsPanel showToast={showToast} />}
        {tab === 'logs' && <LogsPanel showToast={showToast} />}
        {tab === 'settings' && <SettingsPanel showToast={showToast} />}
      </div>

      {/* 轻提示 */}
      {toast && (
        <div className={`fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg sm:bottom-8 ${
          toast.type === 'success' ? 'bg-gray-900' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
