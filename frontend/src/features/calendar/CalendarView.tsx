import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import type { CalendarZoom, DaysShown, TimeEntry } from '../../api/types'
import { MinusIcon, PlayIcon, PlusIcon } from '../../components/icons'
import { NO_PROJECT_COLOR, projectTextColor, projectTint } from '../../lib/colors'
import {
  addDays,
  addMinutes,
  entrySeconds,
  formatDuration,
  formatHourLabel,
  isSameDay,
  minutesSinceStartOfDay,
  secondsWithin,
  shiftDays,
} from '../../lib/time'
import { useNow } from '../../lib/useNow'
import { useClientLookup } from '../clients/useClients'
import { useProjectLookup } from '../projects/useProjects'
import { isOptimistic } from '../time-entries/useTimeEntries'
import { segmentsForDay, type DaySegment } from './layout'

const HOUR_HEIGHT_BY_ZOOM: Record<CalendarZoom, number> = { 1: 28, 2: 44, 3: 64, 4: 96, 5: 144 }
const SNAP_MINUTES_BY_ZOOM: Record<CalendarZoom, number> = { 1: 30, 2: 15, 3: 15, 4: 10, 5: 5 }
const MIN_ZOOM: CalendarZoom = 1
const MAX_ZOOM: CalendarZoom = 5
const MINUTES_PER_DAY = 24 * 60
const DEFAULT_SCROLL_HOUR = 8
const CLICK_ENTRY_MINUTES = 30
const CLICK_TOLERANCE_PX = 4
const MIN_BLOCK_HEIGHT = 12
const MIN_PLAY_BLOCK_HEIGHT = 24
const MIN_RESIZE_BLOCK_HEIGHT = 20
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

interface CalendarViewProps {
  weekStart: Date
  daysShown: DaysShown
  entries: TimeEntry[]
  now: Date
  zoom: CalendarZoom
  onZoomChange: (zoom: CalendarZoom) => void
  onCreate: (start: Date, stop: Date, anchor: DOMRect) => void
  onSelect: (entry: TimeEntry, anchor: DOMRect) => void
  onContinue: (entry: TimeEntry) => void
  onReschedule: (entry: TimeEntry, start: Date, stop: Date) => void
  pendingRange: { start: Date; stop: Date } | null
}

type EntryDragMode = 'move' | 'resize-start' | 'resize-end'

const DRAG_CURSOR: Record<EntryDragMode, string> = { move: 'grabbing', 'resize-start': 'ns-resize', 'resize-end': 'ns-resize' }

interface EntryPreview {
  entryId: string
  start: string
  stop: string
  baseEntries: TimeEntry[]
}

interface DragState {
  dayIndex: number
  anchorMinute: number
  currentMinute: number
}

export function CalendarView(props: CalendarViewProps) {
  const { weekStart, daysShown, entries, now, zoom, onZoomChange, onCreate, onSelect, onContinue, onReschedule, pendingRange } = props
  const hourHeight = HOUR_HEIGHT_BY_ZOOM[zoom]
  const snapMinutes = SNAP_MINUTES_BY_ZOOM[zoom]
  const days = Array.from({ length: daysShown }, (_, index) => addDays(weekStart, index))
  const clock = useNow(true, 60_000)

  const scrollRef = useRef<HTMLDivElement>(null)
  const topMinuteRef = useRef(DEFAULT_SCROLL_HOUR * 60)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [preview, setPreview] = useState<EntryPreview | null>(null)
  const [pressedId, setPressedId] = useState<string | null>(null)

  const activePreview = preview?.baseEntries === entries ? preview : null
  const shownEntries = activePreview
    ? entries.map((entry) => (entry.id === activePreview.entryId ? { ...entry, start: activePreview.start, stop: activePreview.stop } : entry))
    : entries

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (topMinuteRef.current / 60) * hourHeight
  }, [hourHeight])

  const minuteFromEvent = (event: MouseEvent | ReactMouseEvent, column: HTMLElement, round: (value: number) => number) => {
    const offset = event.clientY - column.getBoundingClientRect().top
    const minute = round((offset / hourHeight) * 60 / snapMinutes) * snapMinutes
    return Math.min(MINUTES_PER_DAY, Math.max(0, minute))
  }

  const handleColumnMouseDown = (event: ReactMouseEvent<HTMLDivElement>, dayIndex: number) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return
    const column = event.currentTarget
    const day = days[dayIndex]
    const anchorMinute = minuteFromEvent(event, column, Math.floor)
    setDrag({ dayIndex, anchorMinute, currentMinute: anchorMinute })

    const handleMove = (moveEvent: MouseEvent) => {
      const currentMinute = minuteFromEvent(moveEvent, column, Math.round)
      setDrag({ dayIndex, anchorMinute, currentMinute })
    }
    const pressY = event.clientY
    const handleUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMove)
      setDrag(null)
      const isClick = Math.abs(upEvent.clientY - pressY) < CLICK_TOLERANCE_PX
      const releaseMinute = minuteFromEvent(upEvent, column, Math.round)
      const startMinute = isClick ? anchorMinute : Math.min(anchorMinute, releaseMinute)
      const draggedEnd = Math.max(anchorMinute, releaseMinute, startMinute + snapMinutes)
      const endMinute = Math.min(MINUTES_PER_DAY, isClick ? anchorMinute + CLICK_ENTRY_MINUTES : draggedEnd)
      const columnRect = column.getBoundingClientRect()
      const anchor = new DOMRect(
        columnRect.left,
        columnRect.top + (startMinute / 60) * hourHeight,
        columnRect.width,
        ((endMinute - startMinute) / 60) * hourHeight,
      )
      onCreate(addMinutes(day, startMinute), addMinutes(day, endMinute), anchor)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp, { once: true })
  }

  const dayIndexAt = (clientX: number) => {
    const columns = [...(scrollRef.current?.querySelectorAll<HTMLElement>('[data-day-index]') ?? [])]
    const index = columns.findIndex((column) => clientX < column.getBoundingClientRect().right)
    return index === -1 ? columns.length - 1 : index
  }

  const handleEntryMouseDown = (event: ReactMouseEvent<HTMLElement>, entry: TimeEntry, dayIndex: number, mode: EntryDragMode) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    if (isOptimistic(entry)) return
    const block = event.currentTarget.closest<HTMLElement>('[data-entry-id]')
    const column = block?.parentElement
    if (!block || !column) return
    const pressX = event.clientX
    const pressY = event.clientY
    const originalStart = new Date(entry.start)
    const originalStop = entry.stop ? new Date(entry.stop) : null
    let moved: { start: Date; stop: Date } | null = null
    setPressedId(entry.id)

    const draggedTimes = (moveEvent: MouseEvent, start: Date, stop: Date) => {
      const minSpan = snapMinutes * 60_000
      if (mode === 'move') {
        const deltaMinutes = Math.round(((moveEvent.clientY - pressY) / hourHeight) * 60 / snapMinutes) * snapMinutes
        const deltaDays = dayIndexAt(moveEvent.clientX) - dayIndex
        return {
          start: addMinutes(shiftDays(start, deltaDays), deltaMinutes),
          stop: addMinutes(shiftDays(stop, deltaDays), deltaMinutes),
        }
      }
      const edge = addMinutes(days[dayIndex], minuteFromEvent(moveEvent, column, Math.round)).getTime()
      if (mode === 'resize-start') return { start: new Date(Math.min(edge, stop.getTime() - minSpan)), stop }
      return { start, stop: new Date(Math.max(edge, start.getTime() + minSpan)) }
    }

    const handleMove = (moveEvent: MouseEvent) => {
      if (!originalStop) return
      if (!moved && Math.hypot(moveEvent.clientX - pressX, moveEvent.clientY - pressY) < CLICK_TOLERANCE_PX) return
      moved = draggedTimes(moveEvent, originalStart, originalStop)
      const { start, stop } = moved
      document.body.style.cursor = DRAG_CURSOR[mode]
      setPreview({ entryId: entry.id, start: start.toISOString(), stop: stop.toISOString(), baseEntries: entries })
    }
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove)
      document.body.style.cursor = ''
      setPressedId(null)
      if (!moved) return onSelect(entry, block.getBoundingClientRect())
      const unchanged = moved.start.getTime() === originalStart.getTime() && moved.stop.getTime() === originalStop?.getTime()
      if (unchanged) return setPreview(null)
      onReschedule(entry, moved.start, moved.stop)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp, { once: true })
  }

  const gridTemplate = { gridTemplateColumns: `72px repeat(${daysShown}, minmax(0, 1fr))` }

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-line bg-surface">
      <div className="grid border-b border-line" style={gridTemplate}>
        <div className="flex items-center justify-center gap-1">
          <ZoomButton label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => onZoomChange((zoom - 1) as CalendarZoom)}>
            <MinusIcon />
          </ZoomButton>
          <ZoomButton label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => onZoomChange((zoom + 1) as CalendarZoom)}>
            <PlusIcon />
          </ZoomButton>
        </div>
        {days.map((day) => (
          <DayHeader key={day.toISOString()} day={day} entries={shownEntries} now={now} isToday={isSameDay(day, clock)} />
        ))}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto select-none"
        onScroll={(event) => {
          topMinuteRef.current = (event.currentTarget.scrollTop / hourHeight) * 60
        }}
      >
        <div className="grid" style={{ ...gridTemplate, height: 24 * hourHeight }}>
          <div className="relative">
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute right-3 -translate-y-1/2 text-[11px] text-muted"
                style={{ top: hour * hourHeight }}
              >
                {hour > 0 && formatHourLabel(hour)}
              </span>
            ))}
          </div>
          {days.map((day, dayIndex) => (
            <div
              key={day.toISOString()}
              data-day-index={dayIndex}
              onMouseDown={(event) => handleColumnMouseDown(event, dayIndex)}
              className="relative cursor-crosshair border-l border-line"
              style={{
                backgroundImage: 'linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)',
                backgroundSize: `100% ${hourHeight}px`,
              }}
            >
              {segmentsForDay(shownEntries, day, now).map((segment) => (
                <EntryBlock
                  key={segment.entry.id}
                  segment={segment}
                  hourHeight={hourHeight}
                  now={now}
                  isLifted={segment.entry.id === pressedId || segment.entry.id === activePreview?.entryId}
                  onMouseDown={(event, mode) => handleEntryMouseDown(event, segment.entry, dayIndex, mode)}
                  onSelect={onSelect}
                  onContinue={onContinue}
                />
              ))}
              {drag?.dayIndex === dayIndex && (
                <RangeGhost
                  startMinute={Math.min(drag.anchorMinute, drag.currentMinute)}
                  endMinute={Math.max(drag.anchorMinute, drag.currentMinute)}
                  hourHeight={hourHeight}
                />
              )}
              {!drag && pendingRange && isSameDay(pendingRange.start, day) && (
                <RangeGhost
                  startMinute={minutesSinceStartOfDay(pendingRange.start)}
                  endMinute={Math.min(MINUTES_PER_DAY, (pendingRange.stop.getTime() - day.getTime()) / 60_000)}
                  hourHeight={hourHeight}
                />
              )}
              {isSameDay(day, clock) && <NowLine minute={minutesSinceStartOfDay(clock)} hourHeight={hourHeight} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ZoomButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md p-1 text-ink-soft hover:bg-canvas hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function DayHeader({ day, entries, now, isToday }: { day: Date; entries: TimeEntry[]; now: Date; isToday: boolean }) {
  const totalSeconds = entries.reduce((sum, entry) => sum + secondsWithin(entry, day, addDays(day, 1), now), 0)
  return (
    <div className="flex items-center gap-2 border-l border-line px-3 py-3">
      <span
        className={`flex size-10 items-center justify-center rounded-full font-display text-2xl ${isToday ? 'bg-primary-soft text-accent' : ''}`}
      >
        {day.getDate()}
      </span>
      <div className="leading-tight">
        <p className={`text-[11px] font-semibold uppercase ${isToday ? 'text-accent' : 'text-ink-soft'}`}>
          {day.toLocaleDateString([], { weekday: 'short' })}
        </p>
        <p className="text-xs text-muted tabular-nums">{formatDuration(totalSeconds)}</p>
      </div>
    </div>
  )
}

interface EntryBlockProps {
  segment: DaySegment
  hourHeight: number
  now: Date
  isLifted: boolean
  onMouseDown: (event: ReactMouseEvent<HTMLElement>, mode: EntryDragMode) => void
  onSelect: (entry: TimeEntry, anchor: DOMRect) => void
  onContinue: (entry: TimeEntry) => void
}

const HOVER_TINT = 1.5
const RUNNING_TINT = 0.4

function runningStripes(color: string): string {
  const stripe = `color-mix(in srgb, ${color} 14%, transparent)`
  return `repeating-linear-gradient(-45deg, transparent 0 7px, ${stripe} 7px 8.4px)`
}

function EntryBlock({ segment, hourHeight, now, isLifted, onMouseDown, onSelect, onContinue }: EntryBlockProps) {
  const projects = useProjectLookup()
  const clients = useClientLookup()
  const { entry } = segment
  const project = entry.project_id ? projects.get(entry.project_id) : undefined
  const client = project?.client_id ? clients.get(project.client_id) : undefined
  const color = project?.color ?? NO_PROJECT_COLOR
  const top = (minutesSinceStartOfDay(segment.start) / 60) * hourHeight
  const durationMinutes = (segment.end.getTime() - segment.start.getTime()) / 60_000
  const height = Math.max(MIN_BLOCK_HEIGHT, (durationMinutes / 60) * hourHeight - 2)
  const isRunning = entry.stop === null
  const isPending = isOptimistic(entry)
  const canResize = !isRunning && !isPending && height >= MIN_RESIZE_BLOCK_HEIGHT
  const { startsHere, endsHere } = segment

  return (
    <div
      role="button"
      tabIndex={0}
      data-entry-id={entry.id}
      onMouseDown={(event) => onMouseDown(event, 'move')}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.target !== event.currentTarget || isPending) return
        onSelect(entry, event.currentTarget.getBoundingClientRect())
      }}
      className={`group absolute flex cursor-pointer flex-col justify-start overflow-hidden rounded-md border-l-[3px] bg-(--tint) px-2 py-1 text-left text-xs hover:bg-(--tint-hover) hover:shadow-md ${isRunning ? 'rounded-b-none border-y border-r border-line-strong shadow-sm' : ''} ${isLifted ? 'z-20 bg-(--tint-hover) shadow-(--lift-shadow) ring-2 ring-ink/70 hover:shadow-(--lift-shadow)' : 'transition-[background-color,box-shadow] duration-150 ease-out'}`}
      style={
        {
          top: top + 1,
          height,
          left: `calc(${(segment.lane / segment.laneCount) * 100}% + 2px)`,
          width: `calc(${100 / segment.laneCount}% - 4px)`,
          '--tint': isRunning ? projectTint(color, RUNNING_TINT) : projectTint(color),
          '--tint-hover': projectTint(color, isRunning ? RUNNING_TINT * 1.5 : HOVER_TINT),
          backgroundImage: isRunning ? runningStripes(color) : undefined,
          borderLeftColor: color,
        } as CSSProperties
      }
    >
      {height >= 20 && <p className="truncate font-semibold text-ink">{entry.description || '(no description)'}</p>}
      {height >= 36 && project && (
        <p className="truncate text-muted">
          <span className="font-medium" style={{ color: projectTextColor(color) }}>{project.name}</span>
          {client && ` · ${client.name}`}
        </p>
      )}
      {height >= 52 && <p className="mt-auto font-medium text-ink tabular-nums">{formatDuration(entrySeconds(entry, now))}</p>}
      {canResize && startsHere && <ResizeHandle edge="start" onMouseDown={(event) => onMouseDown(event, 'resize-start')} />}
      {canResize && endsHere && <ResizeHandle edge="end" onMouseDown={(event) => onMouseDown(event, 'resize-end')} />}
      {!isRunning && !isPending && height >= MIN_PLAY_BLOCK_HEIGHT && (
        <button
          title="Continue"
          aria-label="Continue this entry"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onContinue(entry)
          }}
          className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-primary text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:bg-primary-strong focus-visible:opacity-100"
        >
          <PlayIcon width={10} height={10} />
        </button>
      )}
    </div>
  )
}

function ResizeHandle({ edge, onMouseDown }: { edge: 'start' | 'end'; onMouseDown: (event: ReactMouseEvent<HTMLElement>) => void }) {
  return (
    <div
      aria-hidden="true"
      onMouseDown={onMouseDown}
      className={`absolute inset-x-0 flex h-2 cursor-ns-resize items-center justify-center ${edge === 'start' ? 'top-0' : 'bottom-0'}`}
    >
      <span className="h-[3px] w-3 border-y border-ink-soft opacity-0 transition-opacity group-hover:opacity-70" />
    </div>
  )
}

function RangeGhost({ startMinute, endMinute, hourHeight }: { startMinute: number; endMinute: number; hourHeight: number }) {
  const height = Math.max(2, ((endMinute - startMinute) / 60) * hourHeight)
  return (
    <div
      className="pointer-events-none absolute inset-x-1 overflow-hidden rounded-md border border-dashed border-primary bg-primary/10 px-2 text-[11px] text-accent tabular-nums"
      style={{ top: (startMinute / 60) * hourHeight, height }}
    >
      {height >= 16 && formatDuration((endMinute - startMinute) * 60)}
    </div>
  )
}

function NowLine({ minute, hourHeight }: { minute: number; hourHeight: number }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: (minute / 60) * hourHeight }}>
      <div className="absolute -top-[5px] -left-[5px] size-2.5 rounded-full bg-primary" />
      <div className="h-0.5 bg-primary" />
    </div>
  )
}
