import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useCurrentUser } from '../features/auth/useAuth'
import { applyTheme } from '../lib/theme'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  const { theme } = useCurrentUser().preferences

  useEffect(() => applyTheme(theme), [theme])

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}
