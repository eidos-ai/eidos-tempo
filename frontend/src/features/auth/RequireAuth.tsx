import { Navigate, Outlet } from 'react-router-dom'
import { CurrentUserContext, useCurrentUser } from './CurrentUserContext'
import { useSession } from './useAuth'

export function RequireAuth() {
  const { data: user, isPending } = useSession()
  if (isPending) return <div className="flex h-full items-center justify-center text-muted">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return (
    <CurrentUserContext.Provider value={user}>
      <Outlet />
    </CurrentUserContext.Provider>
  )
}

export function RequireAdmin() {
  const user = useCurrentUser()
  if (user.role !== 'admin') return <Navigate to="/timer" replace />
  return <Outlet />
}
