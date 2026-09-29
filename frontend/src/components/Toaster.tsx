import { useEffect, useState } from 'react'
import { subscribeToToasts } from '../lib/toast'

const TOAST_DURATION_MS = 4000

export function Toaster() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let timer: number | undefined
    const unsubscribe = subscribeToToasts((next) => {
      setMessage(next)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setMessage(null), TOAST_DURATION_MS)
    })
    return () => {
      unsubscribe()
      window.clearTimeout(timer)
    }
  }, [])

  if (!message) return null
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-xl">
      {message}
    </div>
  )
}
