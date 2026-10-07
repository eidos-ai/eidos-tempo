import { dayLabel, entrySeconds, formatDuration, secondsSince, startOfDay, startOfWeek } from '../time'
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
  running: TimeEntry | null
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

function weekSeconds(entries: TimeEntry[], running: TimeEntry | null, now: Date): number {
  const weekStart = startOfWeek(now)
  const tracked = running ? [...entries, running] : entries
  return tracked.reduce((sum, entry) => sum + secondsSince(entry, weekStart, now), 0)
}

export function RecentEntries({ entries, running, lookups, isBusy, onContinue }: RecentEntriesProps) {
  const now = useNow(running !== null)
  const groups = groupByDay(entries, now)

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
      <div className="flex items-center gap-2 px-1">
        <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">Week total</span>
        <span className="text-sm font-semibold tabular-nums">{formatDuration(weekSeconds(entries, running, now))}</span>
      </div>
      {groups.length === 0 && (
        <p className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-sm text-muted">
          No time entries in the last 7 days.
        </p>
      )}
      {groups.map((group) => (
        <section key={group.day.getTime()} className="overflow-hidden rounded-xl border border-line bg-surface">
          <header className="flex items-center justify-between bg-canvas/60 py-2.5 pr-10 pl-4 text-sm">
            <span className="font-semibold">{dayLabel(group.day, now)}</span>
            <span className="font-medium text-ink-soft tabular-nums">{formatDuration(group.totalSeconds)}</span>
          </header>
          <ul className="divide-y divide-line">
            {group.entries.map((entry) => {
              const project = entry.project_id ? lookups.projects.get(entry.project_id) : undefined
              return (
                <li
                  key={entry.id}
                  className="group flex min-h-14 items-center gap-2 py-2 pr-2 pl-4 text-sm transition-colors duration-150 ease-out hover:bg-canvas/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className={`truncate ${entry.description ? 'text-ink' : 'text-muted'}`}>
                      {entry.description || '(no description)'}
                    </p>
                    {project && (
                      <p className="truncate text-xs">
                        <ProjectLabel project={project} client={clientOf(project, lookups)} />
                      </p>
                    )}
                  </div>
                  <span className="font-medium tabular-nums">{formatDuration(entrySeconds(entry, now))}</span>
                  <button
                    type="button"
                    onClick={() => onContinue(entry)}
                    disabled={isBusy}
                    aria-label={`Continue ${entry.description || 'this entry'}`}
                    title="Continue"
                    className="rounded-md p-1 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary-soft hover:text-primary focus-visible:opacity-100"
                  >
                    <PlayIcon width={16} height={16} />
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
