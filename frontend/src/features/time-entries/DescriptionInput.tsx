import { useState, type KeyboardEvent } from 'react'
import type { EntrySuggestion, Project } from '../../api/types'
import { useClientLookup } from '../clients/useClients'
import { ProjectLabel } from '../projects/ProjectLabel'
import { useProjectLookup, useProjects } from '../projects/useProjects'
import { matchProjects, matchSuggestions, useEntrySuggestions } from './suggestions'

interface DescriptionInputProps {
  value: string
  onChange: (value: string) => void
  onSelect: (suggestion: EntrySuggestion) => void
  onSelectProject: (projectId: string) => void
  onSubmit?: (input: HTMLInputElement) => void
  onFocus?: () => void
  onBlur?: () => void
  placeholder: string
  maxLength: number
  className: string
  autoFocus?: boolean
}

type Option = { kind: 'entry'; suggestion: EntrySuggestion } | { kind: 'project'; project: Project }

export function DescriptionInput(props: DescriptionInputProps) {
  const { value, onChange, onSelect, onSelectProject, onSubmit, onFocus, onBlur } = props
  const [isOpen, setIsOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const { data: suggestions = [] } = useEntrySuggestions()
  const { data: allProjects = [] } = useProjects()
  const projects = useProjectLookup()
  const clients = useClientLookup()

  const entryOptions: Option[] = matchSuggestions(suggestions, value, projects, clients).map((suggestion) => ({
    kind: 'entry',
    suggestion,
  }))
  const projectOptions: Option[] = matchProjects(allProjects, value, clients).map((project) => ({
    kind: 'project',
    project,
  }))
  const options = [...entryOptions, ...projectOptions]
  const showList = isOpen && options.length > 0

  const choose = (option: Option) => {
    if (option.kind === 'entry') onSelect(option.suggestion)
    else onSelectProject(option.project.id)
    setIsOpen(false)
    setHighlighted(-1)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setIsOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setHighlighted((current) => Math.max(-1, Math.min(options.length - 1, current + step)))
    } else if (event.key === 'Enter') {
      if (showList && highlighted >= 0 && options[highlighted]) {
        event.preventDefault()
        choose(options[highlighted])
      } else if (onSubmit) {
        event.preventDefault()
        setIsOpen(false)
        onSubmit(event.currentTarget)
      }
    } else if (event.key === 'Escape' && showList) {
      event.stopPropagation()
      setIsOpen(false)
      setHighlighted(-1)
    }
  }

  const renderOption = (option: Option, index: number) => (
    <li
      key={option.kind === 'entry' ? `entry|${option.suggestion.description}|${option.suggestion.project_id}` : `project|${option.project.id}`}
      role="option"
      aria-selected={index === highlighted}
      onMouseDown={(event) => {
        event.preventDefault()
        choose(option)
      }}
      onMouseEnter={() => setHighlighted(index)}
      className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${index === highlighted ? 'bg-primary-soft' : ''}`}
    >
      {option.kind === 'entry' ? (
        <>
          <span className="truncate text-ink">{option.suggestion.description}</span>
          {option.suggestion.project_id && (
            <span className="min-w-0 shrink text-xs">
              <ProjectLabel project={projects.get(option.suggestion.project_id)} />
            </span>
          )}
        </>
      ) : (
        <ProjectLabel project={option.project} />
      )}
    </li>
  )

  return (
    <div className="relative min-w-0 flex-1 self-stretch">
      <input
        value={value}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        autoFocus={props.autoFocus}
        autoComplete="off"
        className={props.className}
        onChange={(event) => {
          onChange(event.target.value)
          setIsOpen(true)
          setHighlighted(-1)
        }}
        onMouseDown={() => setIsOpen(true)}
        onFocus={onFocus}
        onBlur={() => {
          setIsOpen(false)
          setHighlighted(-1)
          onBlur?.()
        }}
        onKeyDown={handleKeyDown}
      />
      {showList && (
        <ul
          role="listbox"
          className="absolute top-full left-0 z-40 mt-1 max-h-96 w-full min-w-80 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-xl"
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

function SectionTitle({ children }: { children: string }) {
  return (
    <li className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{children}</li>
  )
}
