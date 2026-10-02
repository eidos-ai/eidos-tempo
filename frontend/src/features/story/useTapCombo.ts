import { useRef } from 'react'

const MAX_GAP_MS = 600

export function useTapCombo(taps: number, onCombo: () => void): () => void {
  const count = useRef(0)
  const lastTap = useRef(0)

  return () => {
    const now = performance.now()
    count.current = now - lastTap.current <= MAX_GAP_MS ? count.current + 1 : 1
    lastTap.current = now
    if (count.current === taps) {
      count.current = 0
      onCombo()
    }
  }
}
