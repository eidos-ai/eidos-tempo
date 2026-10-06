import { useCallback, useRef, useState } from 'react'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '../../components/icons'
import { startOfDay } from '../../lib/time'
import { MonthCalendar } from './MonthCalendar'
import {
  DATE_PRESETS,
  MORE_DATE_PRESETS,
  presetLabel,
  shiftRange,
  weekSuffix,
  type DatePreset,
} from './reportFilters'
import { useDismiss } from './useDismiss'

interface DateRangeControlProps {
  from: Date
  to: Date
  onChange: (from: Date, to: Date) => void
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function DateRangeControl({ from, to, onChange }: DateRangeControlProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(containerRef, isOpen, close)
  const preset = presetLabel(from, to)
  const week = weekSuffix(from, to)
  const shift = (direction: 1 | -1) => {
    const [start, end] = shiftRange(from, to, direction)
    onChange(start, end)
  }
  const apply = (start: Date, end: Date) => {
    onChange(start, end)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex h-9 w-72 items-center rounded-lg border border-line-strong text-sm">
        <button type="button" className="h-full px-2 text-muted hover:text-ink" onClick={() => shift(-1)} aria-label="Previous period">
          <ChevronLeftIcon width={14} height={14} />
        </button>
        <button
          type="button"
          className="flex h-full min-w-0 flex-1 items-center justify-center gap-2 font-medium"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
        >
          <CalendarIcon width={15} height={15} />
          {preset ? (
            <span className="truncate">
              {preset}
              {week && <span className="text-muted"> · {week}</span>}
            </span>
          ) : (
            <span className="truncate tabular-nums">
              {formatDate(from)} - {formatDate(to)}
            </span>
          )}
        </button>
        <button type="button" className="h-full px-2 text-muted hover:text-ink" onClick={() => shift(1)} aria-label="Next period">
          <ChevronRightIcon width={14} height={14} />
        </button>
      </div>
      {isOpen && <DateRangePanel from={from} to={to} onApply={apply} />}
    </div>
  )
}

function DateRangePanel({ from, to, onApply }: { from: Date; to: Date; onApply: (from: Date, to: Date) => void }) {
  const [month, setMonth] = useState(() => new Date(from.getFullYear(), from.getMonth(), 1))
  const [pendingStart, setPendingStart] = useState<Date | null>(null)
  const [showAllShortcuts, setShowAllShortcuts] = useState(false)
  const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const current = presetLabel(from, to)
  const pick = (day: Date) => {
    if (!pendingStart) return setPendingStart(day)
    const [start, end] = day < pendingStart ? [day, pendingStart] : [pendingStart, day]
    setPendingStart(null)
    onApply(start, end)
  }
  const choose = (preset: DatePreset) => {
    const [start, end] = preset.range(startOfDay(new Date()))
    onApply(start, end)
  }

  return (
    <div className="absolute top-full left-0 z-40 mt-2 flex rounded-lg border border-line bg-surface shadow-xl">
      <div className="relative w-48 border-r border-line p-2">
        {DATE_PRESETS.map((preset) => (
          <PresetButton key={preset.label} preset={preset} isCurrent={current === preset.label} onChoose={choose} />
        ))}
        <div className="my-2 border-t border-line" />
        <button
          type="button"
          className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-canvas"
          onClick={() => setShowAllShortcuts((shown) => !shown)}
        >
          All shortcuts <ChevronRightIcon width={14} height={14} />
        </button>
        {showAllShortcuts && <AllShortcuts current={current} onChoose={choose} />}
      </div>
      <div className="flex gap-6 p-4">
        <CalendarMonth
          month={month}
          onPrevious={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          from={pendingStart ?? from}
          to={pendingStart ?? to}
          onPick={pick}
        />
        <CalendarMonth
          month={nextMonth}
          onNext={() => setMonth(nextMonth)}
          from={pendingStart ?? from}
          to={pendingStart ?? to}
          onPick={pick}
        />
      </div>
    </div>
  )
}

function PresetButton({ preset, isCurrent, onChoose }: { preset: DatePreset; isCurrent: boolean; onChoose: (preset: DatePreset) => void }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm font-medium ${
        isCurrent ? 'bg-primary-soft text-accent' : 'hover:bg-canvas'
      }`}
      onClick={() => onChoose(preset)}
    >
      {preset.label}
      {preset.label === 'This week' && <span className="rounded bg-canvas px-1.5 text-xs text-muted">Default</span>}
    </button>
  )
}

function AllShortcuts({ current, onChoose }: { current: string | null; onChoose: (preset: DatePreset) => void }) {
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const visible = [...DATE_PRESETS, ...MORE_DATE_PRESETS].filter((preset) => preset.label.toLowerCase().includes(term))

  return (
    <div className="absolute top-40 left-full z-50 -ml-2 w-56 rounded-lg border border-line bg-surface p-2 shadow-xl">
      <div className="mb-1 flex items-center gap-2 rounded-md border border-line-strong px-2 text-muted">
        <SearchIcon width={14} height={14} />
        <input
          autoFocus
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find shortcut..."
          className="h-8 flex-1 bg-transparent text-sm text-ink outline-none"
        />
      </div>
      <div className="max-h-72 overflow-y-auto">
        {visible.map((preset) => (
          <PresetButton key={preset.label} preset={preset} isCurrent={current === preset.label} onChoose={onChoose} />
        ))}
      </div>
    </div>
  )
}

interface CalendarMonthProps {
  month: Date
  from: Date
  to: Date
  onPick: (day: Date) => void
  onPrevious?: () => void
  onNext?: () => void
}

function CalendarMonth({ month, from, to, onPick, onPrevious, onNext }: CalendarMonthProps) {
  return (
    <div>
      <div className="mb-2 flex h-9 items-center justify-center gap-2">
        {onPrevious && (
          <button type="button" aria-label="Previous month" className="mr-auto rounded-md border border-line-strong p-1.5 hover:bg-canvas" onClick={onPrevious}>
            <ChevronLeftIcon width={14} height={14} />
          </button>
        )}
        <span className="font-display text-base font-semibold">
          {month.toLocaleDateString([], { month: 'long', year: 'numeric' })}
        </span>
        {onNext && (
          <button type="button" aria-label="Next month" className="ml-auto rounded-md border border-line-strong p-1.5 hover:bg-canvas" onClick={onNext}>
            <ChevronRightIcon width={14} height={14} />
          </button>
        )}
      </div>
      <MonthCalendar month={month} rangeStart={from} rangeEnd={to} onPick={onPick} />
    </div>
  )
}
