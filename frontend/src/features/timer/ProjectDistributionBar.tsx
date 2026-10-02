import type { TimeEntry } from '../../api/types'
import { NO_PROJECT_COLOR, projectTextColor } from '../../lib/colors'
import { formatDuration, secondsWithin } from '../../lib/time'
import { useClientLookup } from '../clients/useClients'
import { useProjectLookup } from '../projects/useProjects'

interface ProjectDistributionBarProps {
  entries: TimeEntry[]
  rangeStart: Date
  rangeEnd: Date
  now: Date
}

interface ProjectShare {
  key: string
  name: string
  clientName: string | null
  color: string
  seconds: number
}

const NO_PROJECT_KEY = 'no-project'

export function ProjectDistributionBar({ entries, rangeStart, rangeEnd, now }: ProjectDistributionBarProps) {
  const projects = useProjectLookup()
  const clients = useClientLookup()

  const secondsByProject = new Map<string, number>()
  for (const entry of entries) {
    const seconds = secondsWithin(entry, rangeStart, rangeEnd, now)
    if (seconds === 0) continue
    const key = entry.project_id ?? NO_PROJECT_KEY
    secondsByProject.set(key, (secondsByProject.get(key) ?? 0) + seconds)
  }

  const shares: ProjectShare[] = [...secondsByProject.entries()]
    .map(([key, seconds]) => {
      const project = key === NO_PROJECT_KEY ? undefined : projects.get(key)
      const client = project?.client_id ? clients.get(project.client_id) : undefined
      return {
        key,
        name: project?.name ?? 'No project',
        clientName: client?.name ?? null,
        color: project?.color ?? NO_PROJECT_COLOR,
        seconds,
      }
    })
    .sort((a, b) => b.seconds - a.seconds)

  const totalSeconds = shares.reduce((sum, share) => sum + share.seconds, 0)
  if (totalSeconds === 0) return null

  return (
    <div className="flex shrink-0 gap-1 bg-surface px-8 pb-3" aria-label="Time by project">
      {shares.map((share) => {
        const percent = Math.round((share.seconds / totalSeconds) * 100)
        const clientSuffix = share.clientName ? ` · ${share.clientName}` : ''
        return (
          <div
            key={share.key}
            className="min-w-1 overflow-hidden"
            style={{ flexGrow: share.seconds, flexBasis: 0 }}
            title={`${share.name}${clientSuffix}: ${formatDuration(share.seconds)} (${percent}%)`}
          >
            <p className="truncate pb-1 text-xs font-semibold tracking-wide uppercase">
              <span style={{ color: projectTextColor(share.color) }}>{share.name}</span>
              {share.clientName && <span className="text-muted"> · {share.clientName}</span>}
            </p>
            <div className="h-[3px] rounded-full" style={{ backgroundColor: share.color }} />
          </div>
        )
      })}
    </div>
  )
}
