import type { DaysShown, TimerView } from '../../api/types'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '../../components/icons'
import { addDays, formatDuration, formatShortDate, isoWeekNumber, startOfWeek } from '../../lib/time'

interface WeekToolbarProps {
  weekStart: Date
  onWeekChange: (weekStart: Date) => void
  weekTotalSeconds: number
  view: TimerView
  onViewChange: (view: TimerView) => void
  daysShown: DaysShown
  onDaysShownChange: (daysShown: DaysShown) => void
}

const VIEWS: Array<{ value: TimerView; label: string }> = [
  { value: 'calendar', label: 'Calendar' },
  { value: 'list', label: 'List view' },
]

function weekLabel(weekStart: Date): string {
  const currentWeek = startOfWeek(new Date())
  if (weekStart.getTime() === currentWeek.getTime()) return 'This week'
  if (weekStart.getTime() === addDays(currentWeek, -7).getTime()) return 'Last week'
  return `${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 6))}`
}

export function WeekToolbar(props: WeekToolbarProps) {
  const { weekStart, onWeekChange, weekTotalSeconds, view, onViewChange, daysShown, onDaysShownChange } = props

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-6 bg-surface px-8 py-4">
      <div className="flex h-10 items-center rounded-lg border border-line-strong">
        <button className="px-3 text-ink-soft hover:text-ink" onClick={() => onWeekChange(addDays(weekStart, -7))} aria-label="Previous week">
          <ChevronLeftIcon />
        </button>
        <button
          className="flex min-w-48 items-center justify-center gap-2 text-sm font-medium"
          onClick={() => onWeekChange(startOfWeek(new Date()))}
          title="Go to this week"
        >
          <CalendarIcon className="text-ink-soft" />
          {weekLabel(weekStart)}
          <span className="text-muted">· W{isoWeekNumber(weekStart)}</span>
        </button>
        <button className="px-3 text-ink-soft hover:text-ink" onClick={() => onWeekChange(addDays(weekStart, 7))} aria-label="Next week">
          <ChevronRightIcon />
        </button>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold tracking-wider text-muted uppercase">Week total</span>
        <span className="font-display text-lg font-medium tabular-nums">{formatDuration(weekTotalSeconds)}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {view === 'calendar' && (
          <select
            value={daysShown}
            onChange={(event) => onDaysShownChange(Number(event.target.value) as DaysShown)}
            className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none"
          >
            <option value={5}>5 days view</option>
            <option value={7}>7 days view</option>
          </select>
        )}
        <div className="flex h-10 overflow-hidden rounded-lg border border-line-strong">
          {VIEWS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onViewChange(value)}
              className={`px-4 text-sm font-medium transition-colors ${view === value ? 'bg-primary-soft text-accent' : 'text-ink-soft hover:bg-canvas'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
