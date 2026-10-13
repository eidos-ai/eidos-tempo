import { useEffect, useRef, useState } from 'react'
import {
  atTimeOf,
  entrySeconds,
  formatClockTime,
  formatDuration,
  formatShortDay,
  isSameDay,
  parseDuration,
  secondsBetween,
  startOfDay,
  toTimeInputValue,
  withTimeOfDay,
} from '../time'
import type { TimeEntry } from '../types'
import { DayCalendar } from './DayCalendar'
import { swallowNextClick } from './swallowNextClick'
import { TimeField } from './TimeField'

const TIMER_TEXT = 'w-[5.5rem] rounded-lg px-1 text-center text-lg font-semibold tabular-nums'

interface RunningTimerProps {
  entry: TimeEntry | null
  now: Date
  onSaveStart: (start: Date) => void
}

interface RunningTimeEditorProps {
  entry: TimeEntry
  now: Date
  onSave: (start: Date) => void
  onClose: () => void
}

function RunningTimeEditor({ entry, now, onSave, onClose }: RunningTimeEditorProps) {
  const initialStart = new Date(entry.start)
  const [openedAt] = useState(() => new Date())
  const [start, setStart] = useState<Date | null>(initialStart)
  const [day, setDay] = useState(() => startOfDay(initialStart))
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
    if (next && next <= openedAt) setDurationText(formatDuration(secondsBetween(next, openedAt)))
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
    // Escape is handled on the document so it works wherever focus is, and so Chrome doesn't close the popup.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('mousedown', handleMouseDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleMouseDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  })

  return (
    <div
      ref={containerRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !error) commit()
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
        className="absolute top-full right-0 z-40 mt-2 w-80 rounded-lg border border-line bg-surface p-4 shadow-xl"
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
              <span className="text-sm font-medium text-accent tabular-nums">{formatShortDay(day, now)}</span>
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
        <DayCalendar selected={day} onPick={handlePickDay} isDisabled={(candidate) => candidate > now} />
      </div>
    </div>
  )
}

export function RunningTimer({ entry, now, onSaveStart }: RunningTimerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const elapsed = formatDuration(entry ? entrySeconds(entry, now) : 0)

  if (!entry) {
    if (isOpen) setIsOpen(false)
    return <span className={TIMER_TEXT}>{elapsed}</span>
  }
  if (isOpen) return <RunningTimeEditor entry={entry} now={now} onSave={onSaveStart} onClose={() => setIsOpen(false)} />
  return (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      title="Adjust duration"
      className={`${TIMER_TEXT} hover:bg-canvas`}
    >
      {elapsed}
    </button>
  )
}
