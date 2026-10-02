import { useState } from 'react'
import type { TimeEntry } from '../../api/types'
import { addDays, secondsWithin, startOfWeek } from '../../lib/time'
import { useNow } from '../../lib/useNow'
import { useCurrentUser, usePreferenceSetter } from '../auth/useAuth'
import { CalendarView } from '../calendar/CalendarView'
import { ListView } from '../list/ListView'
import {
  useDeleteEntry,
  useRunningEntry,
  useStartTimer,
  useUpdateEntry,
  useWeekEntries,
} from '../time-entries/useTimeEntries'
import { EntryEditor, type EditorTarget } from './EntryEditor'
import { ProjectDistributionBar } from './ProjectDistributionBar'
import { TimerBar } from './TimerBar'
import { WeekToolbar } from './WeekToolbar'

export function TimerPage() {
  const { preferences } = useCurrentUser()
  const setPreference = usePreferenceSetter()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null)
  const [editorKey, setEditorKey] = useState(0)

  const { data: entries = [] } = useWeekEntries(weekStart)
  const { data: running } = useRunningEntry()
  const startTimer = useStartTimer()
  const deleteEntry = useDeleteEntry()
  const updateEntry = useUpdateEntry()
  const now = useNow(Boolean(running))

  const weekEnd = addDays(weekStart, 7)
  const weekTotalSeconds = entries.reduce((sum, entry) => sum + secondsWithin(entry, weekStart, weekEnd, now), 0)

  const openEditor = (target: EditorTarget) => {
    setEditorKey((key) => key + 1)
    setEditorTarget(target)
  }
  const selectEntry = (entry: TimeEntry, anchor: DOMRect) => openEditor({ kind: 'edit', entry, anchor })
  const continueEntry = (entry: TimeEntry) =>
    startTimer.mutate({
      description: entry.description,
      project_id: entry.project_id,
      is_billable: entry.is_billable,
      tag_ids: entry.tag_ids,
    })
  const rescheduleEntry = (entry: TimeEntry, start: Date, stop: Date) =>
    updateEntry.mutate({
      id: entry.id,
      input: {
        description: entry.description,
        project_id: entry.project_id,
        is_billable: entry.is_billable,
        tag_ids: entry.tag_ids,
        start: start.toISOString(),
        stop: stop.toISOString(),
      },
    })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TimerBar />
      <WeekToolbar
        weekStart={weekStart}
        onWeekChange={setWeekStart}
        weekTotalSeconds={weekTotalSeconds}
        view={preferences.default_view}
        onViewChange={(view) => setPreference('default_view', view)}
        daysShown={preferences.days_shown}
        onDaysShownChange={(days) => setPreference('days_shown', days)}
      />
      <ProjectDistributionBar entries={entries} rangeStart={weekStart} rangeEnd={weekEnd} now={now} />
      {preferences.default_view === 'calendar' ? (
        <CalendarView
          weekStart={weekStart}
          daysShown={preferences.days_shown}
          entries={entries}
          now={now}
          zoom={preferences.calendar_zoom}
          onZoomChange={(zoom) => setPreference('calendar_zoom', zoom)}
          onCreate={(start, stop, anchor) => openEditor({ kind: 'create', start, stop, anchor })}
          onSelect={selectEntry}
          onContinue={continueEntry}
          onReschedule={rescheduleEntry}
          pendingRange={editorTarget?.kind === 'create' ? editorTarget : null}
        />
      ) : (
        <ListView
          entries={entries}
          now={now}
          onSelect={selectEntry}
          onContinue={continueEntry}
          onDelete={(entry) => window.confirm('Delete this time entry?') && deleteEntry.mutate(entry.id)}
        />
      )}
      {editorTarget && <EntryEditor key={editorKey} target={editorTarget} onClose={() => setEditorTarget(null)} />}
    </div>
  )
}
