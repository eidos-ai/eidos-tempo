import { useEffect, useState } from 'react'

const TICK_MS = 1000

export function useNow(isTicking: boolean): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!isTicking) return
    const timer = window.setInterval(() => setNow(new Date()), TICK_MS)
    return () => window.clearInterval(timer)
  }, [isTicking])

  return now
}
