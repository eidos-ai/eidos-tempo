import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const GAP = 8
const VIEWPORT_MARGIN = 8

interface PopoverProps {
  anchor: DOMRect
  label: string
  onClose: () => void
  children: ReactNode
}

interface Position {
  top: number
  left: number
}

function popoverPosition(anchor: DOMRect, width: number, height: number, viewportWidth: number, viewportHeight: number): Position {
  const clampLeft = (left: number) => Math.min(Math.max(VIEWPORT_MARGIN, left), viewportWidth - width - VIEWPORT_MARGIN)
  const clampTop = (top: number) => Math.min(Math.max(VIEWPORT_MARGIN, top), viewportHeight - height - VIEWPORT_MARGIN)

  if (anchor.right + GAP + width <= viewportWidth - VIEWPORT_MARGIN) {
    return { top: clampTop(anchor.top), left: anchor.right + GAP }
  }
  if (anchor.left - GAP - width >= VIEWPORT_MARGIN) {
    return { top: clampTop(anchor.top), left: anchor.left - GAP - width }
  }
  const fitsBelow = anchor.bottom + GAP + height <= viewportHeight - VIEWPORT_MARGIN
  return {
    top: clampTop(fitsBelow ? anchor.bottom + GAP : anchor.top - GAP - height),
    left: clampLeft(anchor.right - width),
  }
}

export function Popover({ anchor, label, onClose, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Position | null>(null)

  useLayoutEffect(() => {
    if (!ref.current) return
    const { offsetWidth, offsetHeight } = ref.current
    setPosition(popoverPosition(anchor, offsetWidth, offsetHeight, window.innerWidth, window.innerHeight))
  }, [anchor])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const handleMouseDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className="fixed z-50 w-[26rem] rounded-xl border border-line bg-surface shadow-xl"
      style={position ?? { top: 0, left: 0 }}
    >
      {children}
    </div>
  )
}
