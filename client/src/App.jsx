import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Storyboard from './pages/Storyboard.jsx'
import Titles from './pages/Titles.jsx'
import History from './pages/History.jsx'
import { useSession } from './context/SessionContext.jsx'

/** 未激活卡密时只能访问首页，其余页面重定向回首页 */
function RequireSession({ children }) {
  const { session } = useSession()
  if (!session) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/storyboard"
          element={
            <RequireSession>
              <Storyboard />
            </RequireSession>
          }
        />
        <Route
          path="/titles"
          element={
            <RequireSession>
              <Titles />
            </RequireSession>
          }
        />
        <Route
          path="/history"
          element={
            <RequireSession>
              <History />
            </RequireSession>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
