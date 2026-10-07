import { useEffect, useState } from 'react'
import { entrySeconds, formatDuration } from '../time'
import type { EntrySuggestion, TimeEntry, TimerStartInput } from '../types'
import { DescriptionInput } from './DescriptionInput'
import { DollarIcon, FolderIcon, PlayIcon, StopIcon } from './icons'
import { clientOf, type Lookups } from './lookups'
import { ProjectLabel } from './ProjectLabel'
import { ProjectPicker } from './ProjectPicker'
import { useNow } from './useNow'

const MAX_DESCRIPTION_LENGTH = 500

interface TimerBarProps {
  running: TimeEntry | null
  suggestions: EntrySuggestion[]
  lookups: Lookups
  isBusy: boolean
  onStart: (input: TimerStartInput) => void
  onStop: () => void
  onUpdateRunning: (entry: TimeEntry, input: TimerStartInput) => void
}

export function TimerBar({ running, suggestions, lookups, isBusy, onStart, onStop, onUpdateRunning }: TimerBarProps) {
  const [description, setDescription] = useState(running?.description ?? '')
  const [projectId, setProjectId] = useState<string | null>(running?.project_id ?? null)
  const [isEditing, setIsEditing] = useState(false)
  const now = useNow(running !== null)

  useEffect(() => {
    if (isEditing) return
    setDescription(running?.description ?? '')
    setProjectId(running?.project_id ?? null)
    // Sync only when the running entry changes, not while the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running?.id, running?.description, running?.project_id])

  const commit = (nextDescription: string, nextProjectId: string | null) => {
    if (!running) return
    if (running.description === nextDescription.trim() && running.project_id === nextProjectId) return
    onUpdateRunning(running, { description: nextDescription.trim(), project_id: nextProjectId })
  }

  const startOrStop = () => {
    if (running) onStop()
    else onStart({ description: description.trim(), project_id: projectId })
  }

  const chooseProject = (nextProjectId: string | null) => {
    setProjectId(nextProjectId)
    commit(description, nextProjectId)
  }

  const selectedProject = projectId ? lookups.projects.get(projectId) : undefined
  const isBillable =
    running && running.project_id === projectId ? running.is_billable : (selectedProject?.is_billable ?? false)

  return (
    <div className="shrink-0 border-b border-line bg-surface px-4 pt-2 pb-2">
      <div className="flex items-center gap-3">
        <DescriptionInput
          value={description}
          suggestions={suggestions}
          lookups={lookups}
          maxLength={MAX_DESCRIPTION_LENGTH}
          autoFocus
          className="h-11 w-full bg-transparent text-lg outline-none placeholder:text-muted"
          placeholder={running ? '(no description)' : 'What are you working on?'}
          onChange={setDescription}
          onSelect={(suggestion) => {
            setDescription(suggestion.description)
            setProjectId(suggestion.project_id)
            commit(suggestion.description, suggestion.project_id)
          }}
          onSelectProject={chooseProject}
          onSubmit={(input) => (running ? input.blur() : startOrStop())}
          onFocus={() => setIsEditing(true)}
          onBlur={() => {
            setIsEditing(false)
            commit(description, projectId)
          }}
        />
        <span className="font-display text-lg font-semibold tabular-nums">
          {formatDuration(running ? entrySeconds(running, now) : 0)}
        </span>
        <button
          type="button"
          onClick={startOrStop}
          disabled={isBusy}
          aria-label={running ? 'Stop timer' : 'Start timer'}
          title={running ? 'Stop timer' : 'Start timer'}
          className={`flex size-[42px] shrink-0 items-center justify-center rounded-full text-white shadow-md transition-transform active:scale-95 disabled:opacity-60 ${running ? 'bg-stop hover:brightness-95' : 'bg-primary hover:bg-primary-strong'}`}
        >
          {running ? <StopIcon /> : <PlayIcon />}
        </button>
      </div>
      <div className="-ml-2 flex items-center gap-1">
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
              <span
                className="flex items-center rounded-lg p-2 text-muted hover:bg-canvas hover:text-primary"
                title="Select project"
              >
                <FolderIcon />
              </span>
            )
          }
        />
        <span title={isBillable ? 'Billable' : 'Non-billable'} className={`p-1.5 ${isBillable ? 'text-primary' : 'text-line-strong'}`}>
          <DollarIcon />
        </span>
      </div>
    </div>
  )
}
