import { useEffect, useState } from 'react'
import type { EntrySuggestion, Tag, TimeEntry, TimerStartInput } from './types'
import { DescriptionInput } from './DescriptionInput'
import { DollarIcon, FolderIcon, PlayIcon, StopIcon, TagIcon } from './icons'
import { clientOf, type Lookups } from './lookups'
import { ProjectLabel } from './ProjectLabel'
import { ProjectPicker } from './ProjectPicker'
import { RunningTimer } from './RunningTimer'
import { TagList, TagPicker } from './TagPicker'
import { useNow } from './useNow'

const MAX_DESCRIPTION_LENGTH = 500

interface TimerBarProps {
  running: TimeEntry | null
  suggestions: EntrySuggestion[]
  lookups: Lookups
  tags: Tag[]
  onCreateTag: (name: string) => Promise<Tag | null>
  onStart: (input: TimerStartInput) => void
  onStop: () => void
  onUpdateRunning: (entry: TimeEntry, input: TimerStartInput) => void
}

interface TimerFields {
  description: string
  projectId: string | null
  isBillable: boolean
  tagIds: string[]
}

const EMPTY_FIELDS: TimerFields = { description: '', projectId: null, isBillable: false, tagIds: [] }

function fieldsOf(entry: TimeEntry | null): TimerFields {
  if (!entry) return EMPTY_FIELDS
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

function toInput(fields: TimerFields): TimerStartInput {
  return {
    description: fields.description.trim(),
    project_id: fields.projectId,
    is_billable: fields.isBillable,
    tag_ids: fields.tagIds,
  }
}

export function TimerBar(props: TimerBarProps) {
  const { running, suggestions, lookups, tags, onStart, onStop, onUpdateRunning, onCreateTag } = props
  const [fields, setFields] = useState<TimerFields>(() => fieldsOf(running))
  const [isEditing, setIsEditing] = useState(false)
  const now = useNow(running !== null)

  useEffect(() => {
    if (isEditing) return
    setFields(fieldsOf(running))
    // Sync only when the running entry changes, not while the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running?.id, running?.description, running?.project_id, running?.is_billable, running?.tag_ids.join()])

  const change = (patch: Partial<TimerFields>, shouldCommit: boolean) => {
    const next = { ...fields, ...patch }
    setFields(next)
    if (shouldCommit && running && !sameFields(running, next)) onUpdateRunning(running, toInput(next))
  }

  const startOrStop = () => {
    if (running) onStop()
    else onStart(toInput(fields))
  }

  const billableFor = (projectId: string | null) => (projectId ? (lookups.projects.get(projectId)?.is_billable ?? false) : false)

  const chooseProject = (projectId: string | null) => change({ projectId, isBillable: billableFor(projectId) }, true)

  return (
    <div className="shrink-0 border-b border-line bg-surface px-4 pt-2 pb-2">
      <div className="flex items-center gap-2">
        <DescriptionInput
          value={fields.description}
          suggestions={suggestions}
          lookups={lookups}
          maxLength={MAX_DESCRIPTION_LENGTH}
          autoFocus
          className="h-11 w-full truncate bg-transparent text-base font-medium outline-none placeholder:font-normal placeholder:text-muted"
          placeholder={running ? '(no description)' : 'What are you working on?'}
          onChange={(description) => change({ description }, false)}
          onSelect={(suggestion) =>
            change(
              {
                description: suggestion.description,
                projectId: suggestion.project_id,
                isBillable: billableFor(suggestion.project_id),
              },
              true,
            )
          }
          onSelectProject={chooseProject}
          onSubmit={(input) => (running ? input.blur() : startOrStop())}
          onFocus={() => setIsEditing(true)}
          onBlur={() => {
            setIsEditing(false)
            change({}, true)
          }}
        />
        <RunningTimer
          entry={running}
          now={now}
          onSaveStart={(start) => running && onUpdateRunning(running, { ...toInput(fields), start: start.toISOString() })}
        />
        <button
          type="button"
          onClick={startOrStop}
          aria-label={running ? 'Stop timer' : 'Start timer'}
          title={running ? 'Stop timer' : 'Start timer'}
          className={`flex size-[42px] shrink-0 items-center justify-center rounded-full text-white shadow-md transition-transform active:scale-95 ${running ? 'bg-stop hover:brightness-95' : 'bg-primary hover:bg-primary-strong'}`}
        >
          {running ? <StopIcon /> : <PlayIcon />}
        </button>
      </div>
      <div className="-ml-2 flex items-center gap-1">
        <ProjectPicker
          value={fields.projectId}
          lookups={lookups}
          onChange={chooseProject}
          renderTrigger={(project) =>
            project ? (
              <span className="rounded-lg px-2 py-1.5 text-sm hover:bg-canvas">
                <ProjectLabel project={project} client={clientOf(project, lookups)} />
              </span>
            ) : (
              <span
                className="flex items-center rounded-lg p-2 text-muted hover:bg-canvas hover:text-primary"
                title="Select project"
              >
                <FolderIcon />
              </span>
            )
          }
        />
        <TagPicker
          tags={tags}
          value={fields.tagIds}
          onChange={(tagIds) => change({ tagIds }, true)}
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
          aria-pressed={fields.isBillable}
          onClick={() => change({ isBillable: !fields.isBillable }, true)}
          title={fields.isBillable ? 'Billable (click to make non-billable)' : 'Non-billable (click to make billable)'}
          className={`rounded-lg p-2 hover:bg-canvas ${fields.isBillable ? 'text-primary' : 'text-muted hover:text-primary'}`}
        >
          <DollarIcon />
        </button>
      </div>
    </div>
  )
}
