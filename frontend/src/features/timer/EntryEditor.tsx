import { useState, type FormEvent } from 'react'
import type { TimeEntry, TimeEntryInput } from '../../api/types'
import { Button } from '../../components/Button'
import { CONTROL_CLASSES, Field, TextInput } from '../../components/Field'
import { Modal } from '../../components/Modal'
import { formatDuration, fromDateTimeInputValue, toDateTimeInputValue } from '../../lib/time'
import { ProjectLabel } from '../projects/ProjectLabel'
import { ProjectPicker } from '../projects/ProjectPicker'
import { DescriptionInput } from '../time-entries/DescriptionInput'
import { useCreateEntry, useDeleteEntry, useUpdateEntry } from '../time-entries/useTimeEntries'
import { MAX_DESCRIPTION_LENGTH } from './TimerBar'

export type EditorTarget = { kind: 'edit'; entry: TimeEntry } | { kind: 'create'; start: Date; stop: Date }

interface EntryEditorProps {
  target: EditorTarget
  onClose: () => void
}

export function EntryEditor({ target, onClose }: EntryEditorProps) {
  const createEntry = useCreateEntry()
  const updateEntry = useUpdateEntry()
  const deleteEntry = useDeleteEntry()

  const existing = target.kind === 'edit' ? target.entry : null
  const isRunning = existing !== null && existing.stop === null
  const initialStart = target.kind === 'edit' ? new Date(target.entry.start) : target.start
  const initialStop = target.kind === 'edit' ? (target.entry.stop ? new Date(target.entry.stop) : null) : target.stop

  const [description, setDescription] = useState(existing?.description ?? '')
  const [projectId, setProjectId] = useState<string | null>(existing?.project_id ?? null)
  const [startValue, setStartValue] = useState(toDateTimeInputValue(initialStart))
  const [stopValue, setStopValue] = useState(initialStop ? toDateTimeInputValue(initialStop) : '')
  const [validationError, setValidationError] = useState<string | null>(null)

  const start = fromDateTimeInputValue(startValue)
  const stop = isRunning ? null : fromDateTimeInputValue(stopValue)
  const durationSeconds = start && stop ? Math.max(0, (stop.getTime() - start.getTime()) / 1000) : null

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

  const handleDelete = () => {
    if (!existing) return
    deleteEntry.mutate(existing.id)
    onClose()
  }

  return (
    <Modal title={existing ? 'Edit time entry' : 'New time entry'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Description">
          <DescriptionInput
            value={description}
            maxLength={MAX_DESCRIPTION_LENGTH}
            onChange={setDescription}
            onSelect={(suggestion) => {
              setDescription(suggestion.description)
              setProjectId(suggestion.project_id)
            }}
            onSelectProject={setProjectId}
            placeholder="What did you work on?"
            className={CONTROL_CLASSES}
            autoFocus
          />
        </Field>
        <div className="space-y-1.5">
          <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Project</span>
          <ProjectPicker
            value={projectId}
            onChange={setProjectId}
            renderTrigger={(project) => (
              <span className="flex h-10 w-full items-center rounded-lg border border-line-strong px-3 text-sm">
                <ProjectLabel project={project} />
              </span>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">
            <TextInput type="datetime-local" value={startValue} onChange={(e) => setStartValue(e.target.value)} required />
          </Field>
          <Field label="Stop">
            {isRunning ? (
              <div className="flex h-10 items-center text-sm text-primary">Running</div>
            ) : (
              <TextInput type="datetime-local" value={stopValue} onChange={(e) => setStopValue(e.target.value)} required />
            )}
          </Field>
        </div>
        {durationSeconds !== null && (
          <p className="text-sm text-ink-soft">
            Duration <span className="font-medium text-ink tabular-nums">{formatDuration(Math.floor(durationSeconds))}</span>
          </p>
        )}
        {validationError && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{validationError}</p>}
        <div className="flex items-center justify-between pt-2">
          {existing ? (
            <Button type="button" variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
