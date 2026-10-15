import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { MoreIcon } from './icons'
import { Tooltip } from './Tooltip'

const GAP = 4
const VIEWPORT_MARGIN = 8

export interface MoreMenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
  hint?: string
  danger?: boolean
}

interface MoreMenuProps {
  items: MoreMenuItem[]
  buttonClassName: string
  iconSize?: number
  align?: 'left' | 'right'
}

interface MenuPosition {
  top: number
  left: number
}

// Rendered on the body so a scrolling list or a rounded card (overflow hidden) can't clip it; opens upward
// when there is no room below the button.
function menuPosition(button: DOMRect, menu: HTMLElement, align: 'left' | 'right'): MenuPosition {
  const below = button.bottom + GAP
  const top = below + menu.offsetHeight <= window.innerHeight - VIEWPORT_MARGIN ? below : button.top - GAP - menu.offsetHeight
  const left = align === 'right' ? button.right - menu.offsetWidth : button.left
  return {
    top: Math.max(VIEWPORT_MARGIN, top),
    left: Math.min(Math.max(VIEWPORT_MARGIN, left), window.innerWidth - menu.offsetWidth - VIEWPORT_MARGIN),
  }
}

export function MoreMenu({ items, buttonClassName, iconSize = 18, align = 'right' }: MoreMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const close = () => {
    setIsOpen(false)
    setPosition(null)
  }

  const closeAndFocusButton = () => {
    close()
    buttonRef.current?.focus()
  }

  const enabledItems = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:enabled') ?? [])]

  const handleMenuKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      closeAndFocusButton()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const buttons = enabledItems()
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    buttons[(current + step + buttons.length) % buttons.length]?.focus()
  }

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current || !menuRef.current) return
    setPosition(menuPosition(buttonRef.current.getBoundingClientRect(), menuRef.current, align))
  }, [isOpen, align])

  useEffect(() => {
    if (position) enabledItems()[0]?.focus({ preventScroll: true })
  }, [position])

  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) close()
    }
    // Captured on the document so it works wherever focus is, and stops before a popover's own Escape handler.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      if (menuRef.current?.contains(document.activeElement)) closeAndFocusButton()
      else close()
    }
    const handleScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [isOpen])

  return (
    // Stops clicks (including those in the portal, which bubble through React) from reaching a clickable row.
    <div className="relative flex" onClick={(event) => event.stopPropagation()}>
      <Tooltip label={isOpen ? null : 'More actions'}>
        <button
          ref={buttonRef}
          type="button"
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={() => (isOpen ? close() : setIsOpen(true))}
          className={`${buttonClassName} ${isOpen ? 'bg-canvas' : ''}`}
        >
          <MoreIcon width={iconSize} height={iconSize} />
        </button>
      </Tooltip>
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className={`fixed z-[55] w-40 rounded-lg border border-line bg-surface p-1 shadow-xl ${position ? '' : 'invisible'}`}
            style={position ?? { top: 0, left: 0 }}
            data-floating
            onKeyDown={handleMenuKeyDown}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                title={item.hint}
                disabled={item.disabled}
                onClick={() => {
                  close()
                  item.onSelect()
                }}
                className={`block w-full rounded-md px-3 py-1.5 text-left text-sm font-medium hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent ${item.danger ? 'text-danger' : 'text-ink'}`}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
