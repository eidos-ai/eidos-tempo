import type { Project } from '../../api/types'
import { projectTextColor } from '../../lib/colors'
import { useClientLookup } from '../clients/useClients'

interface ProjectLabelProps {
  project: Project | undefined
  showClient?: boolean
}

export function ProjectLabel({ project, showClient = true }: ProjectLabelProps) {
  const clients = useClientLookup()
  if (!project) return <span className="text-muted">No project</span>
  const client = project.client_id ? clients.get(project.client_id) : undefined

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
      <span className="truncate font-medium" style={{ color: projectTextColor(project.color) }}>
        {project.name}
      </span>
      {showClient && client && <span className="truncate text-muted">· {client.name}</span>}
    </span>
  )
}
