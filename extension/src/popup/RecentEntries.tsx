import { dayLabel, entrySeconds, formatDuration, secondsSince, startOfDay, startOfWeek } from '../time'
import type { TimeEntry } from '../types'
import { PlayIcon } from './icons'
import { clientOf, type Lookups } from './lookups'
import { ProjectLabel } from './ProjectLabel'
import { useNow } from './useNow'

interface EntryGroup {
  latest: TimeEntry
  count: number
  totalSeconds: number
}

interface DayGroup {
  day: Date
  entries: EntryGroup[]
  totalSeconds: number
}

interface RecentEntriesProps {
  entries: TimeEntry[]
  running: TimeEntry | null
  lookups: Lookups
  isBusy: boolean
  onContinue: (entry: TimeEntry) => void
}

function sameWorkKey(entry: TimeEntry): string {
  return `${entry.description}|${entry.project_id}|${entry.is_billable}`
}

function groupByDay(entries: TimeEntry[], now: Date): DayGroup[] {
  const days = new Map<number, { day: Date; groups: Map<string, EntryGroup>; totalSeconds: number }>()
  for (const entry of entries) {
    const day = startOfDay(new Date(entry.start))
    const current = days.get(day.getTime()) ?? { day, groups: new Map<string, EntryGroup>(), totalSeconds: 0 }
    const seconds = entrySeconds(entry, now)
    const key = sameWorkKey(entry)
    const group = current.groups.get(key) ?? { latest: entry, count: 0, totalSeconds: 0 }
    group.count += 1
    group.totalSeconds += seconds
    current.groups.set(key, group)
    current.totalSeconds += seconds
    days.set(day.getTime(), current)
  }
  return [...days.values()].map(({ day, groups, totalSeconds }) => ({ day, entries: [...groups.values()], totalSeconds }))
}

function trackedSince(entries: TimeEntry[], running: TimeEntry | null, rangeStart: Date, now: Date): number {
  const tracked = running ? [...entries, running] : entries
  return tracked.reduce((sum, entry) => sum + secondsSince(entry, rangeStart, now), 0)
}

export function RecentEntries({ entries, running, lookups, isBusy, onContinue }: RecentEntriesProps) {
  const now = useNow(running !== null)
  const days = groupByDay(entries, now)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center gap-5 px-4 py-3 text-sm">
        <Total label="Today total" seconds={trackedSince(entries, running, startOfDay(now), now)} />
        <Total label="Week total" seconds={trackedSince(entries, running, startOfWeek(now), now)} />
      </div>
      {days.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">No time entries in the last 7 days.</p>}
      <div className="space-y-2 pb-2">
        {days.map((day) => (
          <section key={day.day.getTime()} className="border-y border-line bg-surface">
            <header className="flex items-center justify-between px-4 py-3 text-sm font-semibold">
              <span>{dayLabel(day.day, now)}</span>
              <span className="tabular-nums">{formatDuration(day.totalSeconds)}</span>
            </header>
            <ul className="divide-y divide-line border-t border-line">
              {day.entries.map((group) => (
                <EntryRow
                  key={group.latest.id}
                  group={group}
                  lookups={lookups}
                  isBusy={isBusy}
                  onContinue={onContinue}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function Total({ label, seconds }: { label: string; seconds: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</span>
      <span className="font-semibold tabular-nums">{formatDuration(seconds)}</span>
    </span>
  )
}

interface EntryRowProps {
  group: EntryGroup
  lookups: Lookups
  isBusy: boolean
  onContinue: (entry: TimeEntry) => void
}

function EntryRow({ group, lookups, isBusy, onContinue }: EntryRowProps) {
  const { latest, count } = group
  const project = latest.project_id ? lookups.projects.get(latest.project_id) : undefined
  return (
    <li className="group flex items-center gap-3 py-2.5 pr-3 pl-4 text-sm transition-colors duration-150 ease-out hover:bg-canvas/60">
      {count > 1 && (
        <span
          title={`${count} entries`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line-strong text-xs font-semibold text-ink-soft"
        >
          {count}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className={`truncate ${latest.description ? 'text-ink' : 'text-muted'}`}>
          {latest.description || '(no description)'}
        </p>
        <p className="truncate text-xs">
          <ProjectLabel project={project} client={project ? clientOf(project, lookups) : undefined} />
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="tabular-nums">{formatDuration(group.totalSeconds)}</span>
        <button
          type="button"
          onClick={() => onContinue(latest)}
          disabled={isBusy}
          aria-label={`Continue ${latest.description || 'this entry'}`}
          title="Continue"
          className="-mr-1 rounded-md p-1 text-muted transition-colors hover:bg-primary-soft hover:text-primary group-hover:text-ink-soft"
        >
          <PlayIcon width={14} height={14} />
        </button>
      </div>
    </li>
  )
}
