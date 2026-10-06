import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import type { Tag } from '../../api/types'
import { PlusIcon, SearchIcon } from '../../components/icons'
import { shouldOpenUpward } from '../../lib/dropdown'
import { showToast } from '../../lib/toast'
import { useCreateTag, useTagLookup, useTags } from './useTags'

interface TagPickerProps {
  value: string[]
  onChange: (tagIds: string[]) => void
  renderTrigger: (selected: Tag[]) => ReactNode
  align?: 'left' | 'right'
  fullWidth?: boolean
  onClose?: () => void
}

const DROPDOWN_HEIGHT = 340

export function TagPicker({ value, onChange, renderTrigger, align = 'left', fullWidth = false, onClose }: TagPickerProps) {
  const [isOpen, setOpen] = useState(false)
  const [opensUpward, setOpensUpward] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: tags = [] } = useTags()
  const lookup = useTagLookup()
  const createTag = useCreateTag()
  const setIsOpen = (open: boolean) => {
    setOpen(open)
    if (!open) onClose?.()
  }
  const closeOnOutsideClick = useEffectEvent((event: MouseEvent) => {
    if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
  })

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (event: MouseEvent) => closeOnOutsideClick(event)
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  const term = search.trim()
  const visible = tags.filter(
    (tag) => (!tag.is_archived || value.includes(tag.id)) && tag.name.toLowerCase().includes(term.toLowerCase()),
  )
  const exactMatch = tags.find((tag) => tag.name.toLowerCase() === term.toLowerCase())
  const selected = value.map((id) => lookup.get(id)).filter((tag): tag is Tag => tag !== undefined)

  const toggle = (tagId: string) => onChange(value.includes(tagId) ? value.filter((id) => id !== tagId) : [...value, tagId])

  const create = () => {
    createTag.mutate(term, {
      onSuccess: (tag) => {
        onChange([...value, tag.id])
        setSearch('')
      },
      onError: (error) => showToast(error.message),
    })
  }

  const handleEnter = () => {
    if (!term) return
    if (exactMatch && !exactMatch.is_archived) toggle(exactMatch.id)
    else if (!exactMatch) create()
    setSearch('')
  }

  return (
    <div ref={containerRef} className="relative">
      <button type="button" className={`flex max-w-full items-center ${fullWidth ? 'w-full' : ''}`} onClick={(event) => {
          setOpensUpward(shouldOpenUpward(event.currentTarget, DROPDOWN_HEIGHT))
          setIsOpen(!isOpen)
        }}>
        {renderTrigger(selected)}
      </button>
      {isOpen && (
        <div
          className={`absolute z-40 ${opensUpward ? 'bottom-full mb-2' : 'top-full mt-2'} w-72 rounded-xl border border-line bg-surface shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-muted">
            <SearchIcon />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleEnter()
                }
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  setIsOpen(false)
                }
              }}
              placeholder="Search or create tags"
              maxLength={60}
              className="h-8 flex-1 bg-transparent text-sm text-ink outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
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
                onClick={create}
                disabled={createTag.isPending}
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
  if (tags.length === 0) return null
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag.id} className="truncate rounded-md bg-primary-soft px-1.5 py-0.5 text-xs text-accent">
          {tag.name}
        </span>
      ))}
    </span>
  )
}
