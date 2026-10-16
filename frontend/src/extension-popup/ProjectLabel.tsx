import type { Client, Project } from './types'

interface ProjectLabelProps {
  project: Project | undefined
  client?: Client
}

function projectTextColor(color: string): string {
  return `oklch(from ${color} max(l, var(--project-text-min-lightness)) c h)`
}

export function ProjectLabel({ project, client }: ProjectLabelProps) {
  if (!project) return <span className="text-muted">No project</span>
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
      <span className="truncate font-medium" style={{ color: projectTextColor(project.color) }}>
        {project.name}
      </span>
      {client && <span className="truncate text-muted">· {client.name}</span>}
    </span>
  )
}
