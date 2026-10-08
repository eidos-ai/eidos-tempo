import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { swallowNextClick } from '../lib/swallowNextClick'

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
  transformOrigin: string
}

function popoverPosition(anchor: DOMRect, width: number, height: number, viewportWidth: number, viewportHeight: number): Position {
  const clampLeft = (left: number) => Math.min(Math.max(VIEWPORT_MARGIN, left), viewportWidth - width - VIEWPORT_MARGIN)
  const clampTop = (top: number) => Math.min(Math.max(VIEWPORT_MARGIN, top), viewportHeight - height - VIEWPORT_MARGIN)
  const towardAnchorY = (top: number) => Math.min(Math.max(0, anchor.top + anchor.height / 2 - top), height)
  const towardAnchorX = (left: number) => Math.min(Math.max(0, anchor.left + anchor.width / 2 - left), width)

  if (anchor.right + GAP + width <= viewportWidth - VIEWPORT_MARGIN) {
    const top = clampTop(anchor.top)
    return { top, left: anchor.right + GAP, transformOrigin: `0 ${towardAnchorY(top)}px` }
  }
  if (anchor.left - GAP - width >= VIEWPORT_MARGIN) {
    const top = clampTop(anchor.top)
    return { top, left: anchor.left - GAP - width, transformOrigin: `${width}px ${towardAnchorY(top)}px` }
  }
  const fitsBelow = anchor.bottom + GAP + height <= viewportHeight - VIEWPORT_MARGIN
  const top = clampTop(fitsBelow ? anchor.bottom + GAP : anchor.top - GAP - height)
  const left = clampLeft(anchor.right - width)
  return { top, left, transformOrigin: `${towardAnchorX(left)}px ${fitsBelow ? 0 : height}px` }
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
      if (ref.current?.contains(event.target as Node)) return
      event.stopPropagation()
      event.preventDefault()
      swallowNextClick()
      onClose()
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('mousedown', handleMouseDown, true)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('mousedown', handleMouseDown, true)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={`fixed z-50 w-[26rem] rounded-xl border border-line bg-surface shadow-xl ${position ? 'animate-popover-in motion-reduce:animate-none' : 'invisible'}`}
      style={position ?? { top: 0, left: 0 }}
    >
      <div className={position ? 'animate-popover-content motion-reduce:animate-none' : ''}>{children}</div>
    </div>
  )
}
