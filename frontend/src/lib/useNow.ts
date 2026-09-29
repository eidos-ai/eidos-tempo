import { useEffect, useState } from 'react'

export function useNow(isTicking: boolean, intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!isTicking) return
    const timer = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(timer)
  }, [isTicking, intervalMs])

  return now
}
