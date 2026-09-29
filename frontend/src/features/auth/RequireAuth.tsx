import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { Button } from '../../components/Button'
import { CurrentUserContext, useCurrentUser } from './CurrentUserContext'
import { useSession } from './useAuth'

function FullPageMessage({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-4 text-muted">{children}</div>
}

export function RequireAuth() {
  const { data: user, isPending, isError, isFetching, refetch } = useSession()
  if (isPending && !isError) return <FullPageMessage>Loading…</FullPageMessage>
  if (isError) {
    return (
      <FullPageMessage>
        <p>Can't reach the server. Retrying automatically…</p>
        <Button variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
          Retry now
        </Button>
      </FullPageMessage>
    )
  }
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
