import { useState, type FormEvent } from 'react'
import type { TimeEntry, TimeEntryInput } from '../../api/types'
import { Button } from '../../components/Button'
import { CloseIcon, DollarIcon, FolderIcon, PlayIcon, TrashIcon } from '../../components/icons'
import { Popover } from '../../components/Popover'
import { formatDuration, shiftDays, toTimeInputValue, withTimeOfDay } from '../../lib/time'
import { ProjectLabel } from '../projects/ProjectLabel'
import { ProjectPicker } from '../projects/ProjectPicker'
import { useProjectLookup } from '../projects/useProjects'
import { DescriptionInput } from '../time-entries/DescriptionInput'
import { useCreateEntry, useDeleteEntry, useStartTimer, useUpdateEntry } from '../time-entries/useTimeEntries'
import { TimeField } from './TimeField'
import { MAX_DESCRIPTION_LENGTH } from './TimerBar'

export type EditorTarget =
  | { kind: 'edit'; entry: TimeEntry; anchor: DOMRect }
  | { kind: 'create'; start: Date; stop: Date; anchor: DOMRect }

interface EntryEditorProps {
  target: EditorTarget
  onClose: () => void
}

function resolveStart(initialStart: Date, startTime: string): Date | null {
  return startTime === toTimeInputValue(initialStart) ? initialStart : withTimeOfDay(initialStart, startTime)
}

function resolveStop(initialStop: Date, stopTime: string, start: Date | null): Date | null {
  if (stopTime === toTimeInputValue(initialStop)) return initialStop
  const stop = start && withTimeOfDay(start, stopTime)
  if (!start || !stop) return null
  return stop < start ? shiftDays(stop, 1) : stop
}

export function EntryEditor({ target, onClose }: EntryEditorProps) {
  const createEntry = useCreateEntry()
  const updateEntry = useUpdateEntry()
  const deleteEntry = useDeleteEntry()
  const startTimer = useStartTimer()
  const projects = useProjectLookup()

  const existing = target.kind === 'edit' ? target.entry : null
  const isRunning = existing !== null && existing.stop === null
  const initialStart = target.kind === 'edit' ? new Date(target.entry.start) : target.start
  const initialStop = target.kind === 'edit' ? (target.entry.stop ? new Date(target.entry.stop) : null) : target.stop

  const [description, setDescription] = useState(existing?.description ?? '')
  const [projectId, setProjectId] = useState<string | null>(existing?.project_id ?? null)
  const [startTime, setStartTime] = useState(toTimeInputValue(initialStart))
  const [stopTime, setStopTime] = useState(initialStop ? toTimeInputValue(initialStop) : '')
  const [validationError, setValidationError] = useState<string | null>(null)

  const start = resolveStart(initialStart, startTime)
  const stop = initialStop ? resolveStop(initialStop, stopTime, start) : null
  const durationSeconds = start && stop ? Math.max(0, (stop.getTime() - start.getTime()) / 1000) : null
  const selectedProject = projectId ? projects.get(projectId) : undefined

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!start || (!isRunning && !stop)) return setValidationError('Enter valid start and stop times')
    if (stop && stop < start) return setValidationError('Stop time must be after the start time')
    if (isRunning && start > new Date()) return setValidationError('A running entry cannot start in the future')

    const input: TimeEntryInput = {
      description,
      project_id: projectId,
      start: start.toISOString(),
      stop: stop ? stop.toISOString() : null,
    }
    if (existing) updateEntry.mutate({ id: existing.id, input })
    else createEntry.mutate(input)
    onClose()
  }

  const handleContinue = () => {
    if (!existing) return
    startTimer.mutate({ description: existing.description, project_id: existing.project_id })
    onClose()
  }

  const handleDelete = () => {
    if (!existing) return
    deleteEntry.mutate(existing.id)
    onClose()
  }

  return (
    <Popover anchor={target.anchor} label={existing ? 'Edit time entry' : 'New time entry'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3 p-4">
        <div className="flex items-center gap-1">
          {existing && !isRunning && (
            <button
              type="button"
              title="Continue"
              aria-label="Continue this entry"
              onClick={handleContinue}
              className="flex size-8 items-center justify-center rounded-full bg-primary text-white hover:bg-primary-strong"
            >
              <PlayIcon width={14} height={14} />
            </button>
          )}
          {existing && (
            <button
              type="button"
              title="Delete"
              aria-label="Delete this entry"
              onClick={handleDelete}
              className="rounded-md p-1.5 text-ink-soft hover:bg-danger/10 hover:text-danger"
            >
              <TrashIcon />
            </button>
          )}
          <button type="button" aria-label="Close" onClick={onClose} className="ml-auto rounded-md p-1 text-muted hover:text-ink">
            <CloseIcon />
          </button>
        </div>

        <DescriptionInput
          value={description}
          maxLength={MAX_DESCRIPTION_LENGTH}
          onChange={setDescription}
          onSelect={(suggestion) => {
            setDescription(suggestion.description)
            setProjectId(suggestion.project_id)
          }}
          onSelectProject={setProjectId}
          placeholder="(no description)"
          className="h-10 w-full bg-transparent text-lg outline-none placeholder:text-muted"
          autoFocus
        />

        <div className="flex items-center gap-2">
          <ProjectPicker
            value={projectId}
            onChange={setProjectId}
            renderTrigger={(project) =>
              project ? (
                <span className="rounded-lg px-2 py-1 text-sm hover:bg-canvas">
                  <ProjectLabel project={project} />
                </span>
              ) : (
                <span className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-primary" title="Select project">
                  <FolderIcon />
                </span>
              )
            }
          />
          <span
            title={selectedProject?.is_billable ? 'Billable project' : 'Non-billable'}
            className={selectedProject?.is_billable ? 'text-primary' : 'text-line-strong'}
          >
            <DollarIcon />
          </span>
        </div>

        <div className="flex items-center gap-2">
          <TimeField label="Start" value={startTime} onChange={setStartTime} />
          <span className="text-muted">→</span>
          {isRunning ? (
            <span className="text-sm text-primary">Running</span>
          ) : (
            <TimeField label="Stop" value={stopTime} onChange={setStopTime} />
          )}
          <span className="ml-auto text-sm font-medium text-ink tabular-nums">
            {durationSeconds !== null && formatDuration(Math.floor(durationSeconds))}
          </span>
          <Button type="submit">Save</Button>
        </div>

        {validationError && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{validationError}</p>}
      </form>
    </Popover>
  )
}
