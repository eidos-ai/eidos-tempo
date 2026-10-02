import type { Tag, TimeEntry } from '../../api/types'
import { DollarIcon, PlayIcon, TrashIcon } from '../../components/icons'
import {
  addDays,
  entryEnd,
  entrySeconds,
  formatClockTime,
  formatDayHeading,
  formatDuration,
  secondsWithin,
  startOfDay,
} from '../../lib/time'
import { ProjectLabel } from '../projects/ProjectLabel'
import { useProjectLookup } from '../projects/useProjects'
import { TagList } from '../tags/TagPicker'
import { useTagLookup } from '../tags/useTags'
import { isOptimistic } from '../time-entries/useTimeEntries'

interface ListViewProps {
  entries: TimeEntry[]
  now: Date
  onSelect: (entry: TimeEntry, anchor: DOMRect) => void
  onContinue: (entry: TimeEntry) => void
  onDelete: (entry: TimeEntry) => void
}

interface DayGroup {
  day: Date
  entries: TimeEntry[]
}

function groupByDay(entries: TimeEntry[]): DayGroup[] {
  const groups = new Map<number, TimeEntry[]>()
  for (const entry of entries) {
    const key = startOfDay(new Date(entry.start)).getTime()
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([key, dayEntries]) => ({
      day: new Date(key),
      entries: dayEntries.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()),
    }))
}

export function ListView({ entries, now, onSelect, onContinue, onDelete }: ListViewProps) {
  const groups = groupByDay(entries)

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center border-t border-line text-sm text-muted">
        No time tracked this week yet.
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto border-t border-line px-8 py-6">
      {groups.map(({ day, entries: dayEntries }) => (
        <section key={day.toISOString()} className="overflow-hidden rounded-xl border border-line bg-surface">
          <header className="flex items-center justify-between bg-canvas/60 px-5 py-3 text-sm">
            <span className="font-semibold">{formatDayHeading(day)}</span>
            <span className="font-medium text-ink-soft tabular-nums">
              {formatDuration(dayEntries.reduce((sum, e) => sum + secondsWithin(e, day, addDays(day, 1), now), 0))}
            </span>
          </header>
          <ul className="divide-y divide-line">
            {dayEntries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                now={now}
                onSelect={onSelect}
                onContinue={onContinue}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function EntryRow({ entry, now, onSelect, onContinue, onDelete }: { entry: TimeEntry; now: Date } & Omit<ListViewProps, 'entries' | 'now'>) {
  const projects = useProjectLookup()
  const tags = useTagLookup()
  const project = entry.project_id ? projects.get(entry.project_id) : undefined
  const isRunning = entry.stop === null
  const isPending = isOptimistic(entry)

  return (
    <li
      className={`group flex cursor-pointer items-center gap-4 px-5 py-3 text-sm hover:bg-canvas/60 ${isPending ? 'opacity-60' : ''}`}
      onClick={(event) => !isPending && onSelect(entry, event.currentTarget.getBoundingClientRect())}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className={`truncate ${entry.description ? '' : 'text-muted'}`}>{entry.description || '(no description)'}</span>
        {project && <ProjectLabel project={project} />}
        <TagList tags={entry.tag_ids.map((id) => tags.get(id)).filter((tag): tag is Tag => tag !== undefined)} />
      </div>
      <DollarIcon className={entry.is_billable ? 'text-primary' : 'text-line-strong'} />
      <span className="w-40 text-right text-ink-soft tabular-nums">
        {formatClockTime(new Date(entry.start))} – {isRunning ? 'now' : formatClockTime(entryEnd(entry, now))}
      </span>
      <span className={`w-20 text-right font-medium tabular-nums ${isRunning ? 'text-primary' : ''}`}>
        {formatDuration(entrySeconds(entry, now))}
      </span>
      <div className="flex w-16 justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {!isRunning && (
          <button
            title="Continue"
            className="rounded-md p-1 text-ink-soft hover:bg-primary-soft hover:text-primary"
            onClick={(event) => {
              event.stopPropagation()
              onContinue(entry)
            }}
          >
            <PlayIcon />
          </button>
        )}
        {!isPending && (
          <button
            title="Delete"
            className="rounded-md p-1 text-ink-soft hover:bg-danger/10 hover:text-danger"
            onClick={(event) => {
              event.stopPropagation()
              onDelete(entry)
            }}
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </li>
  )
}
