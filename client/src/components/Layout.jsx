import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext.jsx'

/** 顶部导航 + 底部移动端标签栏的响应式布局 */
export default function Layout({ children }) {
  const { session, logout } = useSession()
  const navigate = useNavigate()

  const navItems = [
    { to: '/', label: '首页', icon: '🏠', end: true },
    { to: '/storyboard', label: '分镜拆解', icon: '🎬' },
    { to: '/titles', label: '标题生成', icon: '✨' },
    { to: '/history', label: '历史记录', icon: '📋' },
  ]

  const linkClass = ({ isActive }) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-50 text-blue-700'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`

  return (
    <div className="flex min-h-full flex-col">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              🎬
            </span>
            <span className="text-base font-bold text-gray-900">
              AI 短视频工具箱
            </span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {session ? (
              <>
                <span className="hidden max-w-[160px] truncate rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 md:inline">
                  {session.cardCode}
                </span>
                <button
                  onClick={() => {
                    logout()
                    navigate('/')
                  }}
                  className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  退出
                </button>
              </>
            ) : (
              <Link
                to="/"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                激活卡密
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 sm:pb-10">
        {children}
      </main>

      {/* 移动端底部标签栏 */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white sm:hidden">
        <div className="grid grid-cols-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2 text-xs ${
                  isActive ? 'text-blue-600' : 'text-gray-500'
                }`
              }
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
