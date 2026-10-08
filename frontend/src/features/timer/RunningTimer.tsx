import { useEffect, useRef, useState } from 'react'
import type { TimeEntry } from '../../api/types'
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons'
import { Tooltip } from '../../components/Tooltip'
import { swallowNextClick } from '../../lib/swallowNextClick'
import {
  atTimeOf,
  entrySeconds,
  formatClockTime,
  formatDuration,
  isSameDay,
  parseDuration,
  startOfDay,
  toTimeInputValue,
  withTimeOfDay,
} from '../../lib/time'
import { MonthCalendar } from '../reports/MonthCalendar'
import { TimeField } from './TimeField'

const TIMER_TEXT = 'w-24 rounded-lg px-1 text-center text-lg font-semibold tabular-nums'

interface RunningTimerProps {
  entry: TimeEntry | null
  canEdit: boolean
  now: Date
  onSaveStart: (start: Date) => void
}

interface RunningTimeEditorProps {
  entry: TimeEntry
  now: Date
  onSave: (start: Date) => void
  onClose: () => void
}

function secondsBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
}

function monthOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function RunningTimeEditor({ entry, now, onSave, onClose }: RunningTimeEditorProps) {
  const initialStart = new Date(entry.start)
  const [openedAt] = useState(() => new Date())
  const [start, setStart] = useState<Date | null>(initialStart)
  const [day, setDay] = useState(() => startOfDay(initialStart))
  const [month, setMonth] = useState(() => monthOf(initialStart))
  const [durationText, setDurationText] = useState(() => formatDuration(secondsBetween(initialStart, openedAt)))
  const [startFieldKey, setStartFieldKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const error = !start
    ? 'Enter a valid start time or duration'
    : start > now
      ? 'A running entry cannot start in the future'
      : null

  const showStart = (next: Date | null) => {
    setStart(next)
    if (next) setDurationText(formatDuration(secondsBetween(next, openedAt)))
  }

  const handleStartTime = (value: string) => {
    const keepsStart = value === toTimeInputValue(initialStart) && isSameDay(day, initialStart)
    showStart(keepsStart ? initialStart : withTimeOfDay(day, value))
  }

  const handlePickDay = (picked: Date) => {
    setDay(picked)
    if (start) showStart(atTimeOf(picked, start))
  }

  const handleDuration = (text: string) => {
    setDurationText(text)
    const seconds = parseDuration(text)
    if (seconds === null) return setStart(null)
    const next = new Date(openedAt.getTime() - seconds * 1000)
    setStart(next)
    setDay(startOfDay(next))
    setMonth(monthOf(next))
    setStartFieldKey((key) => key + 1)
  }

  const commit = () => {
    if (start && !error && start.getTime() !== initialStart.getTime()) onSave(start)
    onClose()
  }

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return
      event.stopPropagation()
      event.preventDefault()
      swallowNextClick()
      commit()
    }
    window.addEventListener('mousedown', handleMouseDown, true)
    return () => window.removeEventListener('mousedown', handleMouseDown, true)
  })

  return (
    <div
      ref={containerRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !error) commit()
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <input
        aria-label="Duration"
        autoFocus
        value={durationText}
        autoComplete="off"
        onChange={(event) => handleDuration(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        className={`${TIMER_TEXT} bg-canvas outline-none focus:ring-2 focus:ring-primary/20`}
      />
      <div
        role="dialog"
        aria-label="Edit start time"
        className="absolute top-full right-0 z-40 mt-3 w-80 rounded-lg border border-line bg-surface p-4 shadow-xl"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Start</p>
            <div className="flex items-center gap-2">
              <TimeField
                key={startFieldKey}
                label="Start time"
                value={toTimeInputValue(start ?? initialStart)}
                onChange={handleStartTime}
              />
              <span className="text-sm font-medium text-accent tabular-nums">
                {isSameDay(day, now) ? 'Today' : day.toLocaleDateString([], { month: '2-digit', day: '2-digit' })}
              </span>
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Stop</p>
            <input
              aria-label="Stop time"
              disabled
              value={formatClockTime(now)}
              className="h-9 w-24 rounded-lg border border-line bg-canvas px-2 text-sm text-muted tabular-nums"
            />
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
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
        <MonthCalendar
          month={month}
          rangeStart={day}
          rangeEnd={day}
          onPick={handlePickDay}
          showWeekNumbers={false}
          isDisabled={(candidate) => candidate > now}
        />
      </div>
    </div>
  )
}

export function RunningTimer({ entry, canEdit, now, onSaveStart }: RunningTimerProps) {
  const [openFor, setOpenFor] = useState<string | null>(null)
  const elapsed = entry ? formatDuration(entrySeconds(entry, now)) : '0:00:00'

  if (!entry || !canEdit) return <span className={TIMER_TEXT}>{elapsed}</span>
  if (openFor === entry.id) {
    return <RunningTimeEditor entry={entry} now={now} onSave={onSaveStart} onClose={() => setOpenFor(null)} />
  }
  return (
    <Tooltip label="Adjust duration">
      <button type="button" onClick={() => setOpenFor(entry.id)} className={`${TIMER_TEXT} hover:bg-canvas`}>
        {elapsed}
      </button>
    </Tooltip>
  )
}
