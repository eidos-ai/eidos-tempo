import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from './useAuth'

export function RequireAuth() {
  const { data: user, isPending } = useSession()
  if (isPending) return <div className="flex h-full items-center justify-center text-muted">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

export function RequireAdmin() {
  const { data: user } = useSession()
  if (user?.role !== 'admin') return <Navigate to="/timer" replace />
  return <Outlet />
}
