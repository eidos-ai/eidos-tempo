import { useState } from 'react'
import type { TimeEntry } from '../../api/types'
import { addDays, secondsWithin, startOfWeek } from '../../lib/time'
import { useNow } from '../../lib/useNow'
import { useCurrentUser, usePreferenceSetter } from '../auth/useAuth'
import { CalendarView } from '../calendar/CalendarView'
import { ListView } from '../list/ListView'
import { useDeleteEntry, useRunningEntry, useStartTimer, useWeekEntries } from '../time-entries/useTimeEntries'
import { EntryEditor, type EditorTarget } from './EntryEditor'
import { TimerBar } from './TimerBar'
import { WeekToolbar } from './WeekToolbar'

export function TimerPage() {
  const { preferences } = useCurrentUser()
  const setPreference = usePreferenceSetter()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null)

  const { data: entries = [] } = useWeekEntries(weekStart)
  const { data: running } = useRunningEntry()
  const startTimer = useStartTimer()
  const deleteEntry = useDeleteEntry()
  const now = useNow(Boolean(running))

  const weekEnd = addDays(weekStart, 7)
  const weekTotalSeconds = entries.reduce((sum, entry) => sum + secondsWithin(entry, weekStart, weekEnd, now), 0)

  const selectEntry = (entry: TimeEntry) => setEditorTarget({ kind: 'edit', entry })
  const continueEntry = (entry: TimeEntry) =>
    startTimer.mutate({ description: entry.description, project_id: entry.project_id })

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
      {preferences.default_view === 'calendar' ? (
        <CalendarView
          weekStart={weekStart}
          daysShown={preferences.days_shown}
          entries={entries}
          now={now}
          zoom={preferences.calendar_zoom}
          onZoomChange={(zoom) => setPreference('calendar_zoom', zoom)}
          onCreate={(start, stop) => setEditorTarget({ kind: 'create', start, stop })}
          onSelect={selectEntry}
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
      {editorTarget && <EntryEditor target={editorTarget} onClose={() => setEditorTarget(null)} />}
    </div>
  )
}
