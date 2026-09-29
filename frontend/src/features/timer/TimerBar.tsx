import { useEffect, useRef, useState } from 'react'
import type { EntrySuggestion, TimeEntry } from '../../api/types'
import { DollarIcon, FolderIcon, PlayIcon, StopIcon } from '../../components/icons'
import { entrySeconds, formatDuration } from '../../lib/time'
import { useNow } from '../../lib/useNow'
import { ProjectLabel } from '../projects/ProjectLabel'
import { DescriptionInput } from '../time-entries/DescriptionInput'
import { ProjectPicker } from '../projects/ProjectPicker'
import { useProjectLookup } from '../projects/useProjects'
import {
  isOptimistic,
  useRunningEntry,
  useStartTimer,
  useStopTimer,
  useUpdateEntry,
} from '../time-entries/useTimeEntries'

const APP_TITLE = 'Eidos Tempo'
export const MAX_DESCRIPTION_LENGTH = 500

export function TimerBar() {
  const { data: running = null } = useRunningEntry()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const updateEntry = useUpdateEntry()
  const projects = useProjectLookup()
  const now = useNow(running !== null)

  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const pendingCommit = useRef(false)
  const previousRunning = useRef<TimeEntry | null>(null)

  const saveRunning = (entry: TimeEntry, nextDescription: string, nextProjectId: string | null) => {
    if (entry.description === nextDescription.trim() && entry.project_id === nextProjectId) return
    updateEntry.mutate({
      id: entry.id,
      input: { description: nextDescription, project_id: nextProjectId, start: entry.start, stop: null },
    })
  }

  const commit = (nextDescription: string, nextProjectId: string | null) => {
    if (!running) return
    if (isOptimistic(running)) {
      pendingCommit.current = true
      return
    }
    saveRunning(running, nextDescription, nextProjectId)
  }

  useEffect(() => {
    const failedStart = previousRunning.current !== null && isOptimistic(previousRunning.current)
    previousRunning.current = running
    if (!running) {
      if (failedStart) return
      setDescription('')
      setProjectId(null)
      return
    }
    if (isOptimistic(running)) return
    if (pendingCommit.current) {
      pendingCommit.current = false
      saveRunning(running, description, projectId)
      return
    }
    if (!isEditing) {
      setDescription(running.description)
      setProjectId(running.project_id)
    }
    // Sync only when the running entry itself changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running?.id, running?.description, running?.project_id])

  const elapsed = running ? formatDuration(entrySeconds(running, now)) : '0:00:00'

  useEffect(() => {
    document.title = running ? `${elapsed} • ${APP_TITLE}` : APP_TITLE
  }, [running, elapsed])

  const handleStartStop = () => {
    if (running) stopTimer.mutate()
    else startTimer.mutate({ description, project_id: projectId })
  }

  const handleSuggestion = (suggestion: EntrySuggestion) => {
    setDescription(suggestion.description)
    setProjectId(suggestion.project_id)
    commit(suggestion.description, suggestion.project_id)
  }

  const handleProjectChange = (nextProjectId: string | null) => {
    setProjectId(nextProjectId)
    commit(description, nextProjectId)
  }

  const selectedProject = projectId ? projects.get(projectId) : undefined

  return (
    <div className="flex h-20 shrink-0 items-center gap-4 border-b border-line bg-surface px-8">
      <DescriptionInput
        value={description}
        maxLength={MAX_DESCRIPTION_LENGTH}
        onChange={setDescription}
        onSelect={handleSuggestion}
        onSelectProject={handleProjectChange}
        onFocus={() => setIsEditing(true)}
        onBlur={() => {
          setIsEditing(false)
          commit(description, projectId)
        }}
        onSubmit={(input) => (running ? input.blur() : handleStartStop())}
        placeholder={running ? '(no description)' : 'What are you working on?'}
        className="h-full w-full bg-transparent text-lg outline-none placeholder:text-muted"
      />
      <ProjectPicker
        value={projectId}
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
      <span
        title={selectedProject?.is_billable ? 'Billable project' : 'Non-billable'}
        className={selectedProject?.is_billable ? 'text-primary' : 'text-line-strong'}
      >
        <DollarIcon />
      </span>
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
