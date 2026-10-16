import { useState } from 'react'
import { addDays, isSameDay, startOfWeek } from './time'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface DayCalendarProps {
  selected: Date
  onPick: (day: Date) => void
  isDisabled?: (day: Date) => boolean
}

function monthOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function weeksOf(month: Date): Date[][] {
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const weeks: Date[][] = []
  for (let weekStart = startOfWeek(month); weekStart <= last; weekStart = addDays(weekStart, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset)))
  }
  return weeks
}

export function DayCalendar({ selected, onPick, isDisabled }: DayCalendarProps) {
  const [month, setMonth] = useState(() => monthOf(selected))
  const [shownFor, setShownFor] = useState(selected)
  if (!isSameDay(shownFor, selected)) {
    setShownFor(selected)
    setMonth(monthOf(selected))
  }
  const shiftMonth = (months: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + months, 1))

  return (
    <div>
      <div className="mt-3 mb-1 flex items-center justify-between">
        <span className="font-display font-semibold">{month.toLocaleDateString([], { month: 'long', year: 'numeric' })}</span>
        <span className="flex gap-1">
          <button type="button" aria-label="Previous month" className="rounded-md border border-line-strong p-1 hover:bg-canvas" onClick={() => shiftMonth(-1)}>
            <ChevronLeftIcon width={14} height={14} />
          </button>
          <button type="button" aria-label="Next month" className="rounded-md border border-line-strong p-1 hover:bg-canvas" onClick={() => shiftMonth(1)}>
            <ChevronRightIcon width={14} height={14} />
          </button>
        </span>
      </div>
      <table className="w-full border-separate border-spacing-y-0.5 text-sm">
        <thead>
          <tr className="text-xs text-muted">
            {WEEKDAYS.map((weekday) => (
              <th key={weekday} className="pb-1 font-medium">
                {weekday}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeksOf(month).map((week) => (
            <tr key={week[0].toISOString()}>
              {week.map((day) => (
                <td key={day.toISOString()} className="p-0 text-center">
                  {day.getMonth() === month.getMonth() && (
                    <button
                      type="button"
                      onClick={() => onPick(day)}
                      disabled={isDisabled?.(day)}
                      className={`h-7 w-9 rounded-md font-medium tabular-nums disabled:cursor-default disabled:bg-transparent disabled:text-line-strong ${
                        isSameDay(day, selected) ? 'bg-primary text-white' : 'text-ink hover:bg-canvas'
                      }`}
                    >
                      {day.getDate()}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
