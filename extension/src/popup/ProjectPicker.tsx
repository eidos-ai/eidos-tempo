import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Project } from '../types'
import { SearchIcon } from './icons'
import { clientOf, type Lookups } from './lookups'
import { ProjectLabel } from './ProjectLabel'

interface ProjectPickerProps {
  value: string | null
  lookups: Lookups
  onChange: (projectId: string | null) => void
  renderTrigger: (selected: Project | undefined) => ReactNode
}

interface ProjectGroup {
  clientName: string
  projects: Project[]
}

const NO_CLIENT = 'No client'

export function ProjectPicker({ value, lookups, onChange, renderTrigger }: ProjectPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  const groups = useMemo<ProjectGroup[]>(() => {
    const term = search.trim().toLowerCase()
    const byClient = new Map<string, Project[]>()
    for (const project of lookups.projects.values()) {
      const clientName = clientOf(project, lookups)?.name ?? NO_CLIENT
      if (term && !`${project.name} ${clientName}`.toLowerCase().includes(term)) continue
      byClient.set(clientName, [...(byClient.get(clientName) ?? []), project])
    }
    return [...byClient.entries()]
      .sort(([a], [b]) => (a === NO_CLIENT ? 1 : b === NO_CLIENT ? -1 : a.localeCompare(b)))
      .map(([clientName, groupProjects]) => ({ clientName, projects: groupProjects }))
  }, [lookups, search])

  const select = (projectId: string | null) => {
    onChange(projectId)
    setIsOpen(false)
    setSearch('')
  }

  const firstMatch = groups[0]?.projects[0]

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        className="flex max-w-full items-center"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {renderTrigger(value ? lookups.projects.get(value) : undefined)}
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 z-40 mt-1 w-80 rounded-xl border border-line bg-surface shadow-xl">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-muted">
            <SearchIcon width={16} height={16} />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && firstMatch) select(firstMatch.id)
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setIsOpen(false)
                }
              }}
              placeholder="Search projects or clients"
              className="h-7 flex-1 bg-transparent text-sm text-ink outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => select(null)}
              className="w-full px-3 py-1.5 text-left text-sm text-muted hover:bg-canvas"
            >
              No project
            </button>
            {groups.map((group) => (
              <div key={group.clientName}>
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
                  {group.clientName}
                </p>
                {group.projects.map((project) => (
                  <button
                    type="button"
                    key={project.id}
                    onClick={() => select(project.id)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-canvas ${project.id === value ? 'bg-primary-soft' : ''}`}
                  >
                    <ProjectLabel project={project} />
                    {project.is_billable && <span className="text-xs font-semibold text-muted">$</span>}
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted">No projects found</p>}
          </div>
        </div>
      )}
    </div>
  )
}
