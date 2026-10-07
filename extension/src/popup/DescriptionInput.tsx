import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { EntrySuggestion, Project } from '../types'
import { clientOf, type Lookups } from './lookups'
import { ProjectLabel } from './ProjectLabel'

const MAX_ENTRY_OPTIONS = 6
const MAX_PROJECT_OPTIONS = 4

type Option = { kind: 'entry'; suggestion: EntrySuggestion } | { kind: 'project'; project: Project }

interface DescriptionInputProps {
  value: string
  suggestions: EntrySuggestion[]
  lookups: Lookups
  placeholder: string
  maxLength: number
  className: string
  autoFocus?: boolean
  onChange: (value: string) => void
  onSelect: (suggestion: EntrySuggestion) => void
  onSelectProject: (projectId: string) => void
  onSubmit: (input: HTMLInputElement) => void
  onFocus: () => void
  onBlur: () => void
}

function optionKey(option: Option): string {
  return option.kind === 'entry'
    ? `entry|${option.suggestion.description}|${option.suggestion.project_id}`
    : `project|${option.project.id}`
}

export function DescriptionInput(props: DescriptionInputProps) {
  const { value, suggestions, lookups, onChange, onSelect, onSelectProject, onSubmit } = props
  const [isOpen, setIsOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)

  const term = value.trim().toLowerCase()
  const entryOptions: Option[] = suggestions
    .filter((suggestion) => !term || suggestion.description.toLowerCase().includes(term))
    .slice(0, MAX_ENTRY_OPTIONS)
    .map((suggestion) => ({ kind: 'entry', suggestion }))
  const projectOptions: Option[] = term
    ? [...lookups.projects.values()]
        .filter((project) => `${project.name} ${clientOf(project, lookups)?.name ?? ''}`.toLowerCase().includes(term))
        .slice(0, MAX_PROJECT_OPTIONS)
        .map((project) => ({ kind: 'project', project }))
    : []
  const options = [...entryOptions, ...projectOptions]
  const showList = isOpen && options.length > 0
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (showList) listRef.current?.scrollIntoView({ block: 'nearest' })
  }, [showList])

  const close = () => {
    setIsOpen(false)
    setHighlighted(-1)
  }

  const choose = (option: Option) => {
    if (option.kind === 'entry') onSelect(option.suggestion)
    else onSelectProject(option.project.id)
    close()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setIsOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setHighlighted((current) => Math.max(-1, Math.min(options.length - 1, current + step)))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (showList && options[highlighted]) choose(options[highlighted])
      else {
        close()
        onSubmit(event.currentTarget)
      }
    } else if (event.key === 'Escape' && showList) {
      event.preventDefault()
      close()
    }
  }

  const renderOption = (option: Option, index: number) => (
    <li
      key={optionKey(option)}
      role="option"
      aria-selected={index === highlighted}
      onMouseDown={(event) => {
        event.preventDefault()
        choose(option)
      }}
      onMouseEnter={() => setHighlighted(index)}
      className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${index === highlighted ? 'bg-primary-soft' : ''}`}
    >
      {option.kind === 'entry' ? (
        <>
          <span className="truncate text-ink">{option.suggestion.description}</span>
          {option.suggestion.project_id && (
            <span className="min-w-0 shrink text-xs">
              <ProjectLabel project={lookups.projects.get(option.suggestion.project_id)} />
            </span>
          )}
        </>
      ) : (
        <ProjectLabel project={option.project} client={clientOf(option.project, lookups)} />
      )}
    </li>
  )

  return (
    <div className="relative min-w-0 flex-1">
      <input
        value={value}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        autoFocus={props.autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-label="Description"
        className={props.className}
        onChange={(event) => {
          onChange(event.target.value)
          setIsOpen(true)
          setHighlighted(-1)
        }}
        onMouseDown={() => setIsOpen(true)}
        onFocus={props.onFocus}
        onBlur={() => {
          close()
          props.onBlur()
        }}
        onKeyDown={handleKeyDown}
      />
      {showList && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute top-full left-0 z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-xl"
        >
          {entryOptions.length > 0 && <SectionTitle>Previous entries</SectionTitle>}
          {entryOptions.map((option, index) => renderOption(option, index))}
          {projectOptions.length > 0 && <SectionTitle>Projects</SectionTitle>}
          {projectOptions.map((option, index) => renderOption(option, entryOptions.length + index))}
        </ul>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <li className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{children}</li>
  )
}
