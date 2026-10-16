import { useEffect, useRef, useState } from 'react'
import {
  atTimeOf,
  formatDuration,
  formatShortDay,
  parseDuration,
  secondsBetween,
  shiftDays,
  startOfDay,
  toTimeInputValue,
  withTimeOfDay,
} from './time'
import type { EntrySuggestion, Tag, TimeEntry, TimeEntryInput } from './types'
import { DayCalendar } from './DayCalendar'
import { DescriptionInput } from './DescriptionInput'
import { CloseIcon, DollarIcon, FolderIcon, TagIcon } from './icons'
import { clientOf, type Lookups } from './lookups'
import { ProjectLabel } from './ProjectLabel'
import { ProjectPicker } from './ProjectPicker'
import { TagList, TagPicker } from './TagPicker'
import { TimeField } from './TimeField'

const MAX_DESCRIPTION_LENGTH = 500

interface EntryEditorProps {
  entry: TimeEntry
  draft: TimeEntryInput | null
  suggestions: EntrySuggestion[]
  lookups: Lookups
  tags: Tag[]
  onCreateTag: (name: string) => Promise<Tag | null>
  onSave: (input: TimeEntryInput) => void
  onClose: () => void
}

function periodError(start: Date | null, stop: Date | null): string | null {
  if (!start) return 'Enter a valid start time'
  if (!stop) return 'Enter a valid stop time or duration'
  if (stop < start) return 'Stop must be after start'
  return null
}

function isUnchanged(entry: TimeEntry, input: TimeEntryInput): boolean {
  return (
    entry.description === input.description &&
    entry.project_id === input.project_id &&
    entry.is_billable === input.is_billable &&
    entry.tag_ids.length === input.tag_ids.length &&
    entry.tag_ids.every((id) => input.tag_ids.includes(id)) &&
    new Date(entry.start).getTime() === new Date(input.start).getTime() &&
    new Date(entry.stop ?? entry.start).getTime() === new Date(input.stop ?? input.start).getTime()
  )
}

export function EntryEditor({ entry, draft, suggestions, lookups, tags, onCreateTag, onSave, onClose }: EntryEditorProps) {
  const values = draft ?? entry
  const initialStart = new Date(values.start)
  const initialStop = new Date(values.stop ?? values.start)
  const [description, setDescription] = useState(values.description)
  const [projectId, setProjectId] = useState(values.project_id)
  const [isBillable, setIsBillable] = useState(values.is_billable)
  const [tagIds, setTagIds] = useState(values.tag_ids)
  const [start, setStart] = useState<Date | null>(initialStart)
  const [stop, setStop] = useState<Date | null>(initialStop)
  const [day, setDay] = useState(() => startOfDay(initialStart))
  const [durationText, setDurationText] = useState(() => formatDuration(secondsBetween(initialStart, initialStop)))
  const [stopFieldKey, setStopFieldKey] = useState(0)
  const [isPeriodOpen, setIsPeriodOpen] = useState(false)
  const periodRef = useRef<HTMLDivElement>(null)
  const [now] = useState(() => new Date())
  const error = periodError(start, stop)

  useEffect(() => {
    if (!isPeriodOpen) return
    const handleMouseDown = (event: MouseEvent) => {
      if (!periodRef.current?.contains(event.target as Node)) setIsPeriodOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isPeriodOpen])

  // On the document so Escape works wherever focus is; a menu that handled it marks it defaultPrevented.
  // Preventing it also keeps Chrome from closing the popup.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      if (isPeriodOpen) setIsPeriodOpen(false)
      else onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isPeriodOpen, onClose])

  const showPeriod = (nextStart: Date | null, nextStop: Date | null) => {
    setStart(nextStart)
    setStop(nextStop)
    if (nextStart && nextStop && nextStop >= nextStart) setDurationText(formatDuration(secondsBetween(nextStart, nextStop)))
  }

  const handleStartTime = (value: string) => {
    const keepsStart = value === toTimeInputValue(initialStart) && day.getTime() === startOfDay(initialStart).getTime()
    showPeriod(keepsStart ? initialStart : withTimeOfDay(day, value), stop)
  }

  const handleStopTime = (value: string) => {
    const base = start ?? day
    const keepsStop = value === toTimeInputValue(initialStop) && base.getTime() === initialStart.getTime()
    if (keepsStop) return showPeriod(start, initialStop)
    const candidate = withTimeOfDay(base, value)
    showPeriod(start, candidate && start && candidate < start ? shiftDays(candidate, 1) : candidate)
  }

  const handleDuration = (text: string) => {
    setDurationText(text)
    const seconds = parseDuration(text)
    setStop(seconds !== null && start ? new Date(start.getTime() + seconds * 1000) : null)
    setStopFieldKey((key) => key + 1)
  }

  const handlePickDay = (picked: Date) => {
    setDay(picked)
    if (!start) return
    const nextStart = atTimeOf(picked, start)
    showPeriod(nextStart, stop ? new Date(nextStart.getTime() + stop.getTime() - start.getTime()) : null)
  }

  const chooseProject = (nextProjectId: string | null) => {
    setProjectId(nextProjectId)
    setIsBillable(nextProjectId ? (lookups.projects.get(nextProjectId)?.is_billable ?? false) : false)
  }

  const save = () => {
    if (!start || !stop || error) return
    const input: TimeEntryInput = {
      description: description.trim(),
      project_id: projectId,
      is_billable: isBillable,
      tag_ids: tagIds,
      start: start.toISOString(),
      stop: stop.toISOString(),
    }
    if (draft || !isUnchanged(entry, input)) onSave(input)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-label="Edit time entry"
        className="absolute inset-x-3 top-3 rounded-xl border border-line bg-surface p-4 shadow-xl"
      >
        <header className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Edit time entry</h2>
          <button type="button" aria-label="Close" title="Close" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-canvas hover:text-ink">
            <CloseIcon width={16} height={16} />
          </button>
        </header>

        {draft && (
          <p role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            Your changes were not saved. Check the connection and press Save to try again.
          </p>
        )}

        <DescriptionInput
          value={description}
          suggestions={suggestions}
          lookups={lookups}
          maxLength={MAX_DESCRIPTION_LENGTH}
          autoFocus
          placeholder="Add a description"
          className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
          onChange={setDescription}
          onSelect={(suggestion) => {
            setDescription(suggestion.description)
            chooseProject(suggestion.project_id)
          }}
          onSelectProject={chooseProject}
          onSubmit={save}
          onFocus={() => undefined}
          onBlur={() => undefined}
        />

        <div className="mt-2 -ml-2 flex items-center gap-1">
          <ProjectPicker
            value={projectId}
            lookups={lookups}
            onChange={chooseProject}
            renderTrigger={(project) =>
              project ? (
                <span className="rounded-lg px-2 py-1.5 text-sm hover:bg-canvas">
                  <ProjectLabel project={project} client={clientOf(project, lookups)} />
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-lg p-2 text-sm text-muted hover:bg-canvas hover:text-primary">
                  <FolderIcon width={16} height={16} />
                  Add project
                </span>
              )
            }
          />
          <TagPicker
            tags={tags}
            value={tagIds}
            onChange={setTagIds}
            onCreate={onCreateTag}
            renderTrigger={(selected) =>
              selected.length > 0 ? (
                <span className="max-w-44 rounded-lg px-1.5 py-1 hover:bg-canvas">
                  <TagList tags={selected} />
                </span>
              ) : (
                <span className="flex items-center rounded-lg p-2 text-muted hover:bg-canvas hover:text-primary" title="Add tags">
                  <TagIcon />
                </span>
              )
            }
          />
          <button
            type="button"
            aria-pressed={isBillable}
            onClick={() => setIsBillable(!isBillable)}
            title={isBillable ? 'Billable (click to make non-billable)' : 'Non-billable (click to make billable)'}
            className={`rounded-lg p-2 hover:bg-canvas ${isBillable ? 'text-primary' : 'text-muted hover:text-primary'}`}
          >
            <DollarIcon />
          </button>
        </div>

        <div ref={periodRef} className="relative mt-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold tracking-wider text-muted uppercase" aria-hidden="true">
              Duration
            </span>
            <input
              aria-label="Duration"
              value={durationText}
              autoComplete="off"
              onChange={(event) => handleDuration(event.target.value)}
              onFocus={(event) => {
                event.currentTarget.select()
                setIsPeriodOpen(true)
              }}
              onMouseDown={() => setIsPeriodOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setIsPeriodOpen(false)
              }}
              className="h-10 w-28 rounded-lg border border-line-strong bg-surface px-3 text-center text-base font-semibold tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {isPeriodOpen && (
            <div
              role="dialog"
              aria-label="Edit start and stop"
              className="absolute top-full left-0 z-40 mt-2 w-80 rounded-lg border border-line bg-surface p-4 shadow-xl"
              onKeyDown={(event) => {
                if (event.key === 'Enter') setIsPeriodOpen(false)
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Start</p>
                  <div className="flex items-center gap-2">
                    <TimeField label="Start time" value={toTimeInputValue(start ?? initialStart)} onChange={handleStartTime} />
                    <span className="text-sm font-medium text-accent tabular-nums">{formatShortDay(day, now)}</span>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Stop</p>
                  <div className="flex">
                    <TimeField
                      key={stopFieldKey}
                      label="Stop time"
                      value={toTimeInputValue(stop ?? initialStop)}
                      onChange={handleStopTime}
                    />
                  </div>
                </div>
              </div>
              {error && <p className="mt-2 text-xs text-danger">{error}</p>}
              <DayCalendar selected={day} onPick={handlePickDay} />
            </div>
          )}
        </div>
        {error && !isPeriodOpen && <p className="mt-2 text-xs text-danger">{error}</p>}

        <footer className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-canvas">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={error !== null}
            className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}
