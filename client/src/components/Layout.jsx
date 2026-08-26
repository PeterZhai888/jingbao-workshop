import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext.jsx'

/** 顶部细导航 + 移动端底部纯文字标签栏 */
export default function Layout({ children }) {
  const { session, logout } = useSession()
  const navigate = useNavigate()

  const navItems = [
    { to: '/', label: '首页', end: true },
    { to: '/storyboard', label: '分镜拆解' },
    { to: '/titles', label: '标题生成' },
    { to: '/history', label: '历史记录' },
  ]

  const linkClass = ({ isActive }) =>
    `px-2 py-1 text-sm transition-colors ${
      isActive
        ? 'font-medium text-gray-900'
        : 'text-gray-500 hover:text-gray-900'
    }`

  return (
    <div className="flex min-h-full flex-col">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-12 max-w-4xl items-center justify-between px-5">
          <Link to="/" className="text-[15px] font-semibold tracking-tight text-gray-900">
            AI 短视频工具箱
          </Link>

          <nav className="hidden items-center gap-5 sm:flex">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {session ? (
              <>
                <span className="hidden max-w-[140px] truncate text-xs text-gray-400 md:inline">
                  {session.cardCode}
                </span>
                <button
                  onClick={() => {
                    logout()
                    navigate('/')
                  }}
                  className="text-sm text-gray-400 transition-colors hover:text-gray-900"
                >
                  退出
                </button>
              </>
            ) : (
              <Link to="/" className="text-sm text-gray-500 transition-colors hover:text-gray-900">
                激活卡密
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-20 pt-10 sm:pb-12">
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
                `flex items-center justify-center py-3 text-xs transition-colors ${
                  isActive ? 'font-medium text-gray-900' : 'text-gray-500'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
