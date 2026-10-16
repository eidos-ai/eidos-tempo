import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Tag } from './types'
import { PlusIcon, SearchIcon } from './icons'
import { keepInView } from './keepInView'

const MAX_TAG_LENGTH = 60

interface TagPickerProps {
  tags: Tag[]
  value: string[]
  onChange: (tagIds: string[]) => void
  onCreate: (name: string) => Promise<Tag | null>
  renderTrigger: (selected: Tag[]) => ReactNode
}

export function TagPicker({ tags, value, onChange, onCreate, renderTrigger }: TagPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (isOpen) keepInView(menuRef.current)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  const term = search.trim()
  const visible = tags.filter(
    (tag) => (!tag.is_archived || value.includes(tag.id)) && tag.name.toLowerCase().includes(term.toLowerCase()),
  )
  const exactMatch = tags.find((tag) => tag.name.toLowerCase() === term.toLowerCase())
  const selected = value.map((id) => tags.find((tag) => tag.id === id)).filter((tag): tag is Tag => tag !== undefined)

  const toggle = (tagId: string) => onChange(value.includes(tagId) ? value.filter((id) => id !== tagId) : [...value, tagId])

  const create = async () => {
    setIsCreating(true)
    const tag = await onCreate(term)
    setIsCreating(false)
    if (!tag) return
    onChange([...value, tag.id])
    setSearch('')
  }

  const handleEnter = () => {
    if (!term) return
    if (!exactMatch) {
      void create()
      return
    }
    if (!exactMatch.is_archived) toggle(exactMatch.id)
    setSearch('')
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        className="flex max-w-full items-center"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {renderTrigger(selected)}
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className="absolute top-full left-0 z-40 mt-1 w-72 rounded-xl border border-line bg-surface shadow-xl"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            setIsOpen(false)
            triggerRef.current?.focus()
          }}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-muted">
            <SearchIcon width={16} height={16} />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleEnter()
                }
              }}
              placeholder="Search or create tags"
              maxLength={MAX_TAG_LENGTH}
              className="h-7 flex-1 bg-transparent text-sm text-ink outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {visible.map((tag) => (
              <label key={tag.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-canvas">
                <input
                  type="checkbox"
                  checked={value.includes(tag.id)}
                  onChange={() => toggle(tag.id)}
                  className="size-4 accent-primary"
                />
                <span className="truncate">{tag.name}</span>
                {tag.is_archived && <span className="text-xs text-muted">(archived)</span>}
              </label>
            ))}
            {term && !exactMatch && (
              <button
                type="button"
                onClick={() => void create()}
                disabled={isCreating}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-canvas"
              >
                <PlusIcon width={16} height={16} />
                Create tag “{term}”
              </button>
            )}
            {visible.length === 0 && !term && <p className="px-3 py-4 text-center text-sm text-muted">No tags yet</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export function TagList({ tags }: { tags: Tag[] }) {
  return (
    <span className="flex min-w-0 gap-1 overflow-hidden">
      {tags.map((tag) => (
        <span key={tag.id} className="truncate rounded-md bg-primary-soft px-1.5 py-0.5 text-xs text-accent">
          {tag.name}
        </span>
      ))}
    </span>
  )
}
