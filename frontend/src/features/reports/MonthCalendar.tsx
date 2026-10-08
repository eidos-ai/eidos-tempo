import { addDays, isSameDay, isoWeekNumber, startOfWeek } from '../../lib/time'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface MonthCalendarProps {
  month: Date
  rangeStart: Date | null
  rangeEnd: Date | null
  onPick: (day: Date) => void
  showWeekNumbers?: boolean
  isDisabled?: (day: Date) => boolean
}

function weeksOf(month: Date): Date[][] {
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const weeks: Date[][] = []
  for (let weekStart = startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1)); weekStart <= last; weekStart = addDays(weekStart, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset)))
  }
  return weeks
}

export function MonthCalendar({ month, rangeStart, rangeEnd, onPick, showWeekNumbers = true, isDisabled }: MonthCalendarProps) {
  const weeks = weeksOf(month)
  const inRange = (day: Date) => rangeStart !== null && rangeEnd !== null && day >= rangeStart && day <= rangeEnd
  const isEdge = (day: Date) =>
    (rangeStart !== null && isSameDay(day, rangeStart)) || (rangeEnd !== null && isSameDay(day, rangeEnd))

  return (
    <table className="border-separate border-spacing-y-1 text-sm">
      <thead>
        <tr className="text-xs text-muted">
          {showWeekNumbers && <th className="w-9" />}
          {WEEKDAYS.map((weekday) => (
            <th key={weekday} className="w-9 pb-1 font-medium">
              {weekday}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0].toISOString()}>
            {showWeekNumbers && (
              <td className="border-r border-line pr-2 text-center text-xs text-muted">W{isoWeekNumber(week[0])}</td>
            )}
            {week.map((day) => {
              if (day.getMonth() !== month.getMonth()) return <td key={day.toISOString()} />
              const selected = inRange(day)
              const edge = isEdge(day)
              return (
                <td key={day.toISOString()} className="p-0">
                  <button
                    type="button"
                    onClick={() => onPick(day)}
                    disabled={isDisabled?.(day)}
                    className={`h-8 w-9 font-medium tabular-nums disabled:cursor-default disabled:bg-transparent disabled:text-line-strong ${
                      edge
                        ? 'rounded-md bg-primary text-white'
                        : selected
                          ? 'bg-primary-soft text-accent'
                          : 'rounded-md text-ink hover:bg-canvas'
                    }`}
                  >
                    {day.getDate()}
                  </button>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
