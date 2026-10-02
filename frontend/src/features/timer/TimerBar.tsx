import { useEffect, useRef, useState } from 'react'
import type { EntrySuggestion, TimeEntry } from '../../api/types'
import { FolderIcon, PlayIcon, StopIcon, TagIcon } from '../../components/icons'
import { entrySeconds, formatDuration } from '../../lib/time'
import { useNow } from '../../lib/useNow'
import { ProjectLabel } from '../projects/ProjectLabel'
import { DescriptionInput } from '../time-entries/DescriptionInput'
import { ProjectPicker } from '../projects/ProjectPicker'
import { useProjectLookup } from '../projects/useProjects'
import { TagList, TagPicker } from '../tags/TagPicker'
import {
  isOptimistic,
  useRunningEntry,
  useStartTimer,
  useStopTimer,
  useUpdateEntry,
} from '../time-entries/useTimeEntries'
import { BillableToggle } from './BillableToggle'

const APP_TITLE = 'Eidos Tempo'
export const MAX_DESCRIPTION_LENGTH = 500

interface TimerFields {
  description: string
  projectId: string | null
  isBillable: boolean
  tagIds: string[]
}

const EMPTY_FIELDS: TimerFields = { description: '', projectId: null, isBillable: false, tagIds: [] }

function fieldsOf(entry: TimeEntry): TimerFields {
  return { description: entry.description, projectId: entry.project_id, isBillable: entry.is_billable, tagIds: entry.tag_ids }
}

function sameFields(entry: TimeEntry, fields: TimerFields): boolean {
  return (
    entry.description === fields.description.trim() &&
    entry.project_id === fields.projectId &&
    entry.is_billable === fields.isBillable &&
    entry.tag_ids.length === fields.tagIds.length &&
    entry.tag_ids.every((id) => fields.tagIds.includes(id))
  )
}

export function TimerBar() {
  const { data: running = null } = useRunningEntry()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const updateEntry = useUpdateEntry()
  const projects = useProjectLookup()
  const now = useNow(running !== null)

  const [fields, setFields] = useState<TimerFields>(EMPTY_FIELDS)
  const [isEditing, setIsEditing] = useState(false)
  const pendingCommit = useRef(false)
  const previousRunning = useRef<TimeEntry | null>(null)

  const saveRunning = (entry: TimeEntry, next: TimerFields) => {
    if (sameFields(entry, next)) return
    updateEntry.mutate({
      id: entry.id,
      input: {
        description: next.description,
        project_id: next.projectId,
        is_billable: next.isBillable,
        tag_ids: next.tagIds,
        start: entry.start,
        stop: null,
      },
    })
  }

  const commit = (next: TimerFields) => {
    if (!running) return
    if (isOptimistic(running)) {
      pendingCommit.current = true
      return
    }
    saveRunning(running, next)
  }

  const change = (patch: Partial<TimerFields>, shouldCommit: boolean) => {
    const next = { ...fields, ...patch }
    setFields(next)
    if (shouldCommit) commit(next)
  }

  const billableFor = (projectId: string | null) => (projectId ? (projects.get(projectId)?.is_billable ?? false) : false)

  useEffect(() => {
    const failedStart = previousRunning.current !== null && isOptimistic(previousRunning.current)
    previousRunning.current = running
    if (!running) {
      if (failedStart) return
      setFields(EMPTY_FIELDS)
      return
    }
    if (isOptimistic(running)) return
    if (pendingCommit.current) {
      pendingCommit.current = false
      saveRunning(running, fields)
      return
    }
    if (!isEditing) setFields(fieldsOf(running))
    // Sync only when the running entry itself changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running?.id, running?.description, running?.project_id, running?.is_billable, running?.tag_ids.join()])

  const elapsed = running ? formatDuration(entrySeconds(running, now)) : '0:00:00'

  useEffect(() => {
    document.title = running ? `${elapsed} • ${APP_TITLE}` : APP_TITLE
  }, [running, elapsed])

  const handleStartStop = () => {
    if (running) stopTimer.mutate()
    else
      startTimer.mutate({
        description: fields.description,
        project_id: fields.projectId,
        is_billable: fields.isBillable,
        tag_ids: fields.tagIds,
      })
  }

  const handleSuggestion = (suggestion: EntrySuggestion) =>
    change(
      { description: suggestion.description, projectId: suggestion.project_id, isBillable: billableFor(suggestion.project_id) },
      true,
    )

  const handleProjectChange = (projectId: string | null) =>
    change({ projectId, isBillable: billableFor(projectId) }, true)

  return (
    <div className="flex h-20 shrink-0 items-center gap-4 border-b border-line bg-surface px-8">
      <DescriptionInput
        value={fields.description}
        maxLength={MAX_DESCRIPTION_LENGTH}
        onChange={(description) => change({ description }, false)}
        onSelect={handleSuggestion}
        onSelectProject={handleProjectChange}
        onFocus={() => setIsEditing(true)}
        onBlur={() => {
          setIsEditing(false)
          commit(fields)
        }}
        onSubmit={(input) => (running ? input.blur() : handleStartStop())}
        placeholder={running ? '(no description)' : 'What are you working on?'}
        className="h-full w-full bg-transparent text-lg outline-none placeholder:text-muted"
      />
      <ProjectPicker
        value={fields.projectId}
        onChange={handleProjectChange}
        align="right"
        renderTrigger={(project) =>
          project ? (
            <span className="rounded-lg px-2 py-1 text-sm hover:bg-canvas">
              <ProjectLabel project={project} />
            </span>
          ) : (
            <span className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-primary" title="Select project">
              <FolderIcon />
            </span>
          )
        }
      />
      <TagPicker
        value={fields.tagIds}
        onChange={(tagIds) => change({ tagIds }, true)}
        align="right"
        renderTrigger={(tags) =>
          tags.length > 0 ? (
            <span className="max-w-48 rounded-lg px-1.5 py-1 hover:bg-canvas">
              <TagList tags={tags} />
            </span>
          ) : (
            <span className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-primary" title="Add tags">
              <TagIcon />
            </span>
          )
        }
      />
      <BillableToggle value={fields.isBillable} onChange={(isBillable) => change({ isBillable }, true)} />
      <span className="w-28 text-right font-display text-2xl font-medium tabular-nums">{elapsed}</span>
      <button
        onClick={handleStartStop}
        aria-label={running ? 'Stop timer' : 'Start timer'}
        className={`flex size-12 items-center justify-center rounded-full text-white shadow-md transition-transform active:scale-95 ${running ? 'bg-stop hover:brightness-95' : 'bg-primary hover:bg-primary-strong'}`}
      >
        {running ? <StopIcon /> : <PlayIcon />}
      </button>
    </div>
  )
}
