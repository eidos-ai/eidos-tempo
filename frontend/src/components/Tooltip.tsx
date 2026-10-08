import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const SHOW_DELAY_MS = 150
const GAP = 6
const VIEWPORT_MARGIN = 8

interface TooltipProps {
  label: string | null
  children: ReactNode
}

function Bubble({ anchor, label }: { anchor: DOMRect; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [left, setLeft] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!ref.current) return
    const width = ref.current.offsetWidth
    const centered = anchor.left + anchor.width / 2 - width / 2
    setLeft(Math.min(Math.max(VIEWPORT_MARGIN, centered), window.innerWidth - width - VIEWPORT_MARGIN))
  }, [anchor])

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className={`pointer-events-none fixed z-[60] rounded-md bg-inverse px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-on-inverse shadow-lg ${left === null ? 'invisible' : 'animate-tooltip-in'}`}
      style={{ top: anchor.bottom + GAP, left: left ?? 0 }}
    >
      {label}
    </div>,
    document.body,
  )
}

export function Tooltip({ label, children }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const showTimer = useRef<number | undefined>(undefined)
  const isSuppressed = useRef(false)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  const hide = () => {
    window.clearTimeout(showTimer.current)
    setAnchor(null)
  }

  useEffect(() => () => window.clearTimeout(showTimer.current), [])

  if (!label) return <>{children}</>

  return (
    <span
      ref={triggerRef}
      className="inline-flex"
      onMouseEnter={() => {
        if (isSuppressed.current) return
        showTimer.current = window.setTimeout(() => {
          if (triggerRef.current) setAnchor(triggerRef.current.getBoundingClientRect())
        }, SHOW_DELAY_MS)
      }}
      onMouseLeave={() => {
        isSuppressed.current = false
        hide()
      }}
      onMouseDownCapture={() => {
        isSuppressed.current = true
        hide()
      }}
    >
      {children}
      {anchor && <Bubble anchor={anchor} label={label} />}
    </span>
  )
}
