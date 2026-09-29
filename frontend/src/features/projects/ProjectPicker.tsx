import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Project } from '../../api/types'
import { SearchIcon } from '../../components/icons'
import { useClientLookup } from '../clients/useClients'
import { ProjectLabel } from './ProjectLabel'
import { useProjectLookup, useProjects } from './useProjects'

interface ProjectPickerProps {
  value: string | null
  onChange: (projectId: string | null) => void
  renderTrigger: (selected: Project | undefined) => ReactNode
  align?: 'left' | 'right'
}

interface ProjectGroup {
  clientName: string
  projects: Project[]
}

const NO_CLIENT = 'No client'

export function ProjectPicker({ value, onChange, renderTrigger, align = 'left' }: ProjectPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: projects = [] } = useProjects()
  const projectLookup = useProjectLookup()
  const clients = useClientLookup()

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
    for (const project of projects) {
      if (project.is_archived) continue
      const clientName = project.client_id ? (clients.get(project.client_id)?.name ?? NO_CLIENT) : NO_CLIENT
      if (term && !`${project.name} ${clientName}`.toLowerCase().includes(term)) continue
      byClient.set(clientName, [...(byClient.get(clientName) ?? []), project])
    }
    return [...byClient.entries()]
      .sort(([a], [b]) => (a === NO_CLIENT ? 1 : b === NO_CLIENT ? -1 : a.localeCompare(b)))
      .map(([clientName, groupProjects]) => ({ clientName, projects: groupProjects }))
  }, [projects, clients, search])

  const select = (projectId: string | null) => {
    onChange(projectId)
    setIsOpen(false)
    setSearch('')
  }

  const firstMatch = groups[0]?.projects[0]

  return (
    <div ref={containerRef} className="relative">
      <button type="button" className="flex max-w-full items-center" onClick={() => setIsOpen((open) => !open)}>
        {renderTrigger(value ? projectLookup.get(value) : undefined)}
      </button>
      {isOpen && (
        <div
          className={`absolute top-full z-40 mt-2 w-80 rounded-xl border border-line bg-surface shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-muted">
            <SearchIcon />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && firstMatch) select(firstMatch.id)
                if (event.key === 'Escape') setIsOpen(false)
              }}
              placeholder="Search projects or clients"
              className="h-8 flex-1 bg-transparent text-sm text-ink outline-none"
            />
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => select(null)}
              className="w-full px-3 py-2 text-left text-sm text-muted hover:bg-canvas"
            >
              No project
            </button>
            {groups.map((group) => (
              <div key={group.clientName}>
                <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
                  {group.clientName}
                </p>
                {group.projects.map((project) => (
                  <button
                    type="button"
                    key={project.id}
                    onClick={() => select(project.id)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-canvas ${project.id === value ? 'bg-primary-soft' : ''}`}
                  >
                    <ProjectLabel project={project} showClient={false} />
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
