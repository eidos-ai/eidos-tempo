import { dayLabel, entrySeconds, formatDuration, startOfDay } from '../time'
import type { TimeEntry } from '../types'
import { PlayIcon } from './icons'
import { clientOf, type Lookups } from './lookups'
import { ProjectLabel } from './ProjectLabel'
import { useNow } from './useNow'

interface DayGroup {
  day: Date
  entries: TimeEntry[]
  totalSeconds: number
}

interface RecentEntriesProps {
  entries: TimeEntry[]
  lookups: Lookups
  isBusy: boolean
  onContinue: (entry: TimeEntry) => void
}

function groupByDay(entries: TimeEntry[], now: Date): DayGroup[] {
  const groups = new Map<number, DayGroup>()
  for (const entry of entries) {
    const day = startOfDay(new Date(entry.start))
    const group = groups.get(day.getTime()) ?? { day, entries: [], totalSeconds: 0 }
    group.entries.push(entry)
    group.totalSeconds += entrySeconds(entry, now)
    groups.set(day.getTime(), group)
  }
  return [...groups.values()]
}

export function RecentEntries({ entries, lookups, isBusy, onContinue }: RecentEntriesProps) {
  const now = useNow(false)
  const groups = groupByDay(entries, now)

  if (groups.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted">No time entries in the last 7 days.</p>
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.map((group) => (
        <section key={group.day.getTime()}>
          <h2 className="sticky top-0 flex items-center justify-between bg-canvas px-4 py-1.5 text-xs font-semibold text-ink-soft">
            <span>{dayLabel(group.day, now)}</span>
            <span className="tabular-nums">{formatDuration(group.totalSeconds)}</span>
          </h2>
          <ul>
            {group.entries.map((entry) => {
              const project = entry.project_id ? lookups.projects.get(entry.project_id) : undefined
              return (
                <li key={entry.id} className="group flex items-center gap-3 border-b border-line px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${entry.description ? 'text-ink' : 'text-muted'}`}>
                      {entry.description || '(no description)'}
                    </p>
                    {project && (
                      <p className="truncate text-xs">
                        <ProjectLabel project={project} client={clientOf(project, lookups)} />
                      </p>
                    )}
                  </div>
                  <span className="text-sm text-ink-soft tabular-nums">{formatDuration(entrySeconds(entry, now))}</span>
                  <button
                    type="button"
                    onClick={() => onContinue(entry)}
                    disabled={isBusy}
                    aria-label={`Continue ${entry.description || 'this entry'}`}
                    title="Continue"
                    className="flex size-7 items-center justify-center rounded-full text-primary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary-soft focus-visible:opacity-100"
                  >
                    <PlayIcon width={14} height={14} />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
