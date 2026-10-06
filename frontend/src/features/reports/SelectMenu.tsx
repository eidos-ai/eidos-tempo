import { useCallback, useRef, useState } from 'react'
import { ChevronDownIcon } from '../../components/icons'
import { useDismiss } from './useDismiss'

interface SelectMenuProps<T extends string> {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  align?: 'left' | 'right'
}

export function SelectMenu<T extends string>({ label, value, options, onChange, align = 'right' }: SelectMenuProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(containerRef, isOpen, close)
  const current = options.find((option) => option.value === value)

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${isOpen ? 'border-primary' : 'border-line-strong hover:border-muted'}`}
      >
        <span className="text-muted">{label}:</span>
        <span className="font-semibold">{current?.label}</span>
        <ChevronDownIcon width={14} height={14} className={`ml-2 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div
          role="listbox"
          className={`absolute top-full z-40 mt-1 min-w-full rounded-lg border border-line bg-surface p-1 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`block w-full rounded-md px-3 py-1.5 text-left text-sm whitespace-nowrap ${
                option.value === value ? 'bg-primary-soft font-medium text-accent' : 'hover:bg-canvas'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
