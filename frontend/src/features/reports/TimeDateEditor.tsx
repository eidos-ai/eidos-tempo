import { useRef, useState } from 'react'
import type { ReportEntry } from '../../api/types'
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons'
import { shiftDays, startOfDay, toTimeInputValue, withTimeOfDay } from '../../lib/time'
import { TimeField } from '../timer/TimeField'
import { MonthCalendar } from './MonthCalendar'
import { useDismiss } from './useDismiss'

interface TimeDateEditorProps {
  entry: ReportEntry
  onSave: (start: Date, stop: Date) => void
  onClose: () => void
}

function atTimeOf(day: Date, source: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), source.getHours(), source.getMinutes(), source.getSeconds())
}

function resolvePeriod(
  day: Date,
  startTime: string,
  stopTime: string,
  original: { start: Date; stop: Date },
): { start: Date; stop: Date } | null {
  const keepsStart = startTime === toTimeInputValue(original.start)
  const keepsStop = stopTime === toTimeInputValue(original.stop)
  const start = keepsStart ? atTimeOf(day, original.start) : withTimeOfDay(day, startTime)
  if (start && keepsStart && keepsStop) {
    return { start, stop: new Date(start.getTime() + original.stop.getTime() - original.start.getTime()) }
  }
  const stop = keepsStop ? atTimeOf(day, original.stop) : withTimeOfDay(day, stopTime)
  if (!start || !stop) return null
  return { start, stop: stop < start ? shiftDays(stop, 1) : stop }
}

export function TimeDateEditor({ entry, onSave, onClose }: TimeDateEditorProps) {
  const initialStart = new Date(entry.start)
  const initialStop = new Date(entry.stop ?? entry.start)
  const [day, setDay] = useState(() => startOfDay(initialStart))
  const [month, setMonth] = useState(() => new Date(initialStart.getFullYear(), initialStart.getMonth(), 1))
  const [startTime, setStartTime] = useState(toTimeInputValue(initialStart))
  const [stopTime, setStopTime] = useState(toTimeInputValue(initialStop))
  const containerRef = useRef<HTMLDivElement>(null)
  const period = resolvePeriod(day, startTime, stopTime, { start: initialStart, stop: initialStop })

  const commit = () => {
    const isUnchanged =
      startTime === toTimeInputValue(initialStart) &&
      stopTime === toTimeInputValue(initialStop) &&
      day.getTime() === startOfDay(initialStart).getTime()
    if (period && !isUnchanged) onSave(period.start, period.stop)
    onClose()
  }
  useDismiss(containerRef, true, commit)

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Edit start and stop"
      className="absolute top-full right-0 z-40 mt-1 w-80 rounded-lg border border-line bg-surface p-4 shadow-xl"
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Start</p>
          <div className="flex items-center gap-2">
            <TimeField label="Start time" value={startTime} onChange={setStartTime} />
            <span className="text-sm font-medium text-accent tabular-nums">
              {day.toLocaleDateString([], { month: '2-digit', day: '2-digit' })}
            </span>
          </div>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Stop</p>
          <TimeField label="Stop time" value={stopTime} onChange={setStopTime} />
        </div>
      </div>
      {!period && <p className="mt-2 text-xs text-danger">Enter valid start and stop times</p>}
      <div className="mt-4 mb-2 flex items-center justify-between">
        <span className="font-display font-semibold">{month.toLocaleDateString([], { month: 'long', year: 'numeric' })}</span>
        <span className="flex gap-1">
          <button type="button" aria-label="Previous month" className="rounded-md border border-line-strong p-1.5 hover:bg-canvas" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeftIcon width={14} height={14} />
          </button>
          <button type="button" aria-label="Next month" className="rounded-md border border-line-strong p-1.5 hover:bg-canvas" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRightIcon width={14} height={14} />
          </button>
        </span>
      </div>
      <MonthCalendar month={month} rangeStart={day} rangeEnd={day} onPick={setDay} showWeekNumbers={false} />
    </div>
  )
}
