import { useState } from 'react'
import { dayLabel, entrySeconds, formatClockTime, formatDuration, secondsSince, startOfDay, startOfWeek } from '../time'
import type { EntrySuggestion, Tag, TimeEntry, TimeEntryInput } from '../types'
import { EntryEditor } from './EntryEditor'
import { DollarIcon, PlayIcon } from './icons'
import { clientOf, type Lookups } from './lookups'
import { ProjectLabel } from './ProjectLabel'
import { TagList } from './TagPicker'
import { useNow } from './useNow'

interface EntryGroup {
  key: string
  latest: TimeEntry
  entries: TimeEntry[]
  totalSeconds: number
}

interface DayGroup {
  day: Date
  entries: EntryGroup[]
  totalSeconds: number
}

interface Editing {
  entry: TimeEntry
  draft: TimeEntryInput | null
}

interface RecentEntriesProps {
  entries: TimeEntry[]
  suggestions: EntrySuggestion[]
  running: TimeEntry | null
  lookups: Lookups
  tags: Tag[]
  onCreateTag: (name: string) => Promise<Tag | null>
  onUpdate: (entry: TimeEntry, input: TimeEntryInput) => Promise<boolean>
  onContinue: (entry: TimeEntry) => void
}

// Entries are grouped only when every field but the times is the same.
function sameWorkKey(entry: TimeEntry): string {
  return JSON.stringify([entry.description, entry.project_id, entry.is_billable, [...entry.tag_ids].sort()])
}

function groupByDay(entries: TimeEntry[], now: Date): DayGroup[] {
  const days = new Map<number, { day: Date; groups: Map<string, EntryGroup>; totalSeconds: number }>()
  for (const entry of entries) {
    const day = startOfDay(new Date(entry.start))
    const current = days.get(day.getTime()) ?? { day, groups: new Map<string, EntryGroup>(), totalSeconds: 0 }
    const seconds = entrySeconds(entry, now)
    const key = sameWorkKey(entry)
    const group = current.groups.get(key) ?? { key, latest: entry, entries: [], totalSeconds: 0 }
    group.entries.push(entry)
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

export function RecentEntries(props: RecentEntriesProps) {
  const { entries, suggestions, running, lookups, tags, onCreateTag, onUpdate, onContinue } = props
  const now = useNow(running !== null)
  const days = groupByDay(entries, now)
  const [editing, setEditing] = useState<Editing | null>(null)

  // A failed save reopens the editor with what the user entered, unless another entry is being edited.
  const save = async (entry: TimeEntry, input: TimeEntryInput) => {
    if (await onUpdate(entry, input)) return
    setEditing((current) => current ?? { entry, draft: input })
  }

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
                <EntryGroupRow
                  key={group.key}
                  group={group}
                  lookups={lookups}
                  tags={tags}
                  now={now}
                  onEdit={(entry) => setEditing({ entry, draft: null })}
                  onContinue={onContinue}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
      {editing && (
        <EntryEditor
          key={`${editing.entry.id}|${editing.draft ? 'retry' : 'edit'}`}
          entry={editing.entry}
          draft={editing.draft}
          suggestions={suggestions}
          lookups={lookups}
          tags={tags}
          onCreateTag={onCreateTag}
          onSave={(input) => void save(editing.entry, input)}
          onClose={() => setEditing(null)}
        />
      )}
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

interface EntryGroupRowProps {
  group: EntryGroup
  lookups: Lookups
  tags: Tag[]
  now: Date
  onEdit: (entry: TimeEntry) => void
  onContinue: (entry: TimeEntry) => void
}

function EntryGroupRow({ group, lookups, tags, now, onEdit, onContinue }: EntryGroupRowProps) {
  const { latest, entries } = group
  const [isOpen, setIsOpen] = useState(false)
  const count = entries.length
  const isGroup = count > 1
  const project = latest.project_id ? lookups.projects.get(latest.project_id) : undefined
  const entryTags = latest.tag_ids.map((id) => tags.find((tag) => tag.id === id)).filter((tag): tag is Tag => tag !== undefined)

  return (
    <li>
      {/* The whole row is the target; the inner button keeps it reachable by keyboard and its click bubbles up. */}
      <div
        onClick={() => (isGroup ? setIsOpen(!isOpen) : onEdit(latest))}
        className="group flex cursor-pointer items-center gap-3 py-2 pr-3 pl-4 text-sm transition-colors duration-150 ease-out select-none hover:bg-canvas/60 has-[>button:focus-visible]:bg-canvas"
      >
        <button
          type="button"
          aria-expanded={isGroup ? isOpen : undefined}
          title={isGroup ? (isOpen ? 'Hide entries' : 'Show entries') : 'Edit entry'}
          className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none"
        >
          {isGroup && (
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold transition-colors ${
                isOpen ? 'border-primary bg-primary-soft text-accent' : 'border-line-strong text-ink-soft'
              }`}
            >
              {count}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className={`block truncate ${latest.description ? 'text-ink' : 'text-muted'}`}>
              {latest.description || 'Add a description'}
            </span>
            <span className="flex min-w-0 items-center gap-2 text-xs">
              {project && <ProjectLabel project={project} client={clientOf(project, lookups)} />}
              {entryTags.length > 0 && <TagList tags={entryTags} />}
              {latest.is_billable && <DollarIcon width={12} height={12} className="shrink-0 text-primary" aria-label="Billable" />}
            </span>
          </span>
        </button>
        <div className="flex flex-col items-end gap-0.5">
          <span className="tabular-nums">{formatDuration(group.totalSeconds)}</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onContinue(latest)
            }}
            aria-label={`Continue ${latest.description || 'this entry'}`}
            title="Continue"
            className="-mr-1 rounded-md p-1 text-muted transition-colors hover:bg-primary-soft hover:text-primary group-hover:text-ink-soft"
          >
            <PlayIcon width={14} height={14} />
          </button>
        </div>
      </div>
      {isGroup && isOpen && (
        <ul className="divide-y divide-line border-t border-line bg-canvas/40">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onEdit(entry)}
                title="Edit entry"
                className="flex w-full items-center justify-between py-2 pr-4 pl-14 text-left text-sm tabular-nums select-none hover:bg-canvas"
              >
                <span className="text-ink-soft">
                  {formatClockTime(new Date(entry.start))} – {entry.stop ? formatClockTime(new Date(entry.stop)) : ''}
                </span>
                <span>{formatDuration(entrySeconds(entry, now))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
