import { useState } from 'react'
import { dayLabel, entrySeconds, formatDuration, secondsSince, startOfDay, startOfWeek } from '../time'
import type { EntrySuggestion, TimeEntry, TimerStartInput } from '../types'
import { DescriptionInput } from './DescriptionInput'
import { PlayIcon, PlusIcon } from './icons'
import { clientOf, type Lookups } from './lookups'
import { ProjectLabel } from './ProjectLabel'
import { ProjectPicker } from './ProjectPicker'
import { useNow } from './useNow'

const MAX_DESCRIPTION_LENGTH = 500

interface EntryGroup {
  latest: TimeEntry
  entries: TimeEntry[]
  totalSeconds: number
}

interface DayGroup {
  day: Date
  entries: EntryGroup[]
  totalSeconds: number
}

interface RecentEntriesProps {
  entries: TimeEntry[]
  suggestions: EntrySuggestion[]
  running: TimeEntry | null
  lookups: Lookups
  onUpdate: (entries: TimeEntry[], input: TimerStartInput) => void
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
    const group = current.groups.get(key) ?? { latest: entry, entries: [], totalSeconds: 0 }
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

export function RecentEntries({ entries, suggestions, running, lookups, onUpdate, onContinue }: RecentEntriesProps) {
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
                  key={`${group.latest.id}|${sameWorkKey(group.latest)}`}
                  group={group}
                  suggestions={suggestions}
                  lookups={lookups}
                  onUpdate={onUpdate}
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
  suggestions: EntrySuggestion[]
  lookups: Lookups
  onUpdate: (entries: TimeEntry[], input: TimerStartInput) => void
  onContinue: (entry: TimeEntry) => void
}

function EntryRow({ group, suggestions, lookups, onUpdate, onContinue }: EntryRowProps) {
  const { latest, entries } = group
  const [description, setDescription] = useState(latest.description)
  const [projectId, setProjectId] = useState(latest.project_id)

  const save = (nextDescription: string, nextProjectId: string | null) => {
    if (nextDescription === latest.description && nextProjectId === latest.project_id) return
    onUpdate(entries, { description: nextDescription, project_id: nextProjectId })
  }

  const count = entries.length
  return (
    <li className="group flex items-center gap-3 py-2 pr-3 pl-4 text-sm transition-colors duration-150 ease-out hover:bg-canvas/60">
      {count > 1 && (
        <span
          title={`${count} entries`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line-strong text-xs font-semibold text-ink-soft"
        >
          {count}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <DescriptionInput
          value={description}
          suggestions={suggestions}
          lookups={lookups}
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder="Add a description"
          className="-mx-1.5 block h-7 w-[calc(100%+0.75rem)] truncate rounded-md bg-transparent px-1.5 text-ink outline-none placeholder:text-muted hover:bg-canvas focus:bg-canvas focus:ring-1 focus:ring-line-strong"
          onChange={setDescription}
          onSelect={(suggestion) => {
            setDescription(suggestion.description)
            setProjectId(suggestion.project_id)
            save(suggestion.description, suggestion.project_id)
          }}
          onSelectProject={(nextProjectId) => {
            setProjectId(nextProjectId)
            save(description.trim(), nextProjectId)
          }}
          onSubmit={(input) => input.blur()}
          onFocus={() => undefined}
          onBlur={() => {
            const trimmed = description.trim()
            setDescription(trimmed)
            save(trimmed, projectId)
          }}
        />
        <ProjectPicker
          value={projectId}
          lookups={lookups}
          onChange={(nextProjectId) => {
            setProjectId(nextProjectId)
            save(description.trim(), nextProjectId)
          }}
          renderTrigger={(selected) =>
            selected ? (
              <span className="-mx-1.5 block truncate rounded-md px-1.5 py-0.5 text-xs hover:bg-canvas">
                <ProjectLabel project={selected} client={clientOf(selected, lookups)} />
              </span>
            ) : (
              <span className="-mx-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-canvas hover:text-primary">
                <PlusIcon width={12} height={12} />
                Add project
              </span>
            )
          }
        />
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="tabular-nums">{formatDuration(group.totalSeconds)}</span>
        <button
          type="button"
          onClick={() => onContinue({ ...latest, description: description.trim(), project_id: projectId })}
          aria-label={`Continue ${description || 'this entry'}`}
          title="Continue"
          className="-mr-1 rounded-md p-1 text-muted transition-colors hover:bg-primary-soft hover:text-primary group-hover:text-ink-soft"
        >
          <PlayIcon width={14} height={14} />
        </button>
      </div>
    </li>
  )
}
