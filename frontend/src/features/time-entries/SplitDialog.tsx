import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { TimeEntry } from '../../api/types'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { projectTint } from '../../lib/colors'
import { formatClockTime, formatDuration } from '../../lib/time'
import { useNow } from '../../lib/useNow'
import { useProjectLookup } from '../projects/useProjects'
import { defaultSplitStep, SPLIT_STEP_MS, splitStepCount } from './split'
import { useSplitEntry } from './useTimeEntries'

const BAR_HEIGHT = 200
const LABEL_HEIGHT = 18

interface SplitDialogProps {
  entry: TimeEntry
  onClose: () => void
}

function partLabel(from: Date, to: Date): string {
  const seconds = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000))
  return `${formatDuration(seconds)} (${formatClockTime(from)} – ${formatClockTime(to)})`
}

export function SplitDialog({ entry, onClose }: SplitDialogProps) {
  const projects = useProjectLookup()
  const splitEntry = useSplitEntry()
  const now = useNow(entry.stop === null)
  const start = new Date(entry.start)
  const end = entry.stop ? new Date(entry.stop) : now
  const steps = splitStepCount(start, end)
  const [step, setStep] = useState(() => defaultSplitStep(start, end))
  const barRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)
  const at = new Date(start.getTime() + step * SPLIT_STEP_MS)
  const linePx = Math.round(((at.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * BAR_HEIGHT)
  const color = entry.project_id ? projects.get(entry.project_id)?.color : undefined

  // The button that opened the dialog is gone by now, so focus would fall back to the page.
  useEffect(() => sliderRef.current?.focus(), [])

  const moveTo = (next: number) => setStep(Math.min(Math.max(next, 1), steps))

  const moveToPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect) return
    const fraction = (event.clientY - rect.top) / rect.height
    moveTo(Math.round((fraction * (end.getTime() - start.getTime())) / SPLIT_STEP_MS))
  }

  const split = () => {
    if (steps < 1) return
    splitEntry.mutate({ entry, at: at.toISOString() })
    onClose()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowUp: step - 1, ArrowLeft: step - 1, ArrowDown: step + 1, ArrowRight: step + 1, Home: 1, End: steps }
    if (event.key in moves) {
      event.preventDefault()
      moveTo(moves[event.key])
    } else if (event.key === 'Enter') {
      event.preventDefault()
      split()
    }
  }

  return (
    // Keeps clicks in the dialog from reaching the row or popover it was opened from.
    <div onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
      <Modal title="Split time entry" onClose={onClose}>
        <p className="text-sm text-ink-soft">Choose the split time</p>
        <div
          className="relative mx-auto my-4 w-66 cursor-ns-resize touch-none px-3 select-none"
          style={{ height: BAR_HEIGHT + LABEL_HEIGHT }}
          onPointerDown={(event) => {
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            sliderRef.current?.focus()
            moveToPointer(event)
          }}
          onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && moveToPointer(event)}
        >
          <div
            ref={barRef}
            className="absolute inset-x-3 top-0 rounded-md border border-line"
            style={{ height: BAR_HEIGHT, backgroundColor: color ? projectTint(color, 2) : 'var(--color-canvas)' }}
          />
          <div
            ref={sliderRef}
            role="slider"
            tabIndex={0}
            aria-label="Split time"
            aria-valuemin={1}
            aria-valuemax={steps}
            aria-valuenow={step}
            aria-valuetext={formatClockTime(at)}
            onKeyDown={handleKeyDown}
            className="pointer-events-none absolute inset-x-0 h-0 border-t-2 border-ink outline-none focus-visible:border-primary"
            style={{ top: linePx }}
          >
            <span className="absolute -top-1.5 -left-1 size-3 rounded-full border-2 border-ink bg-surface" />
            <span className="absolute -top-1.5 -right-1 size-3 rounded-full border-2 border-ink bg-surface" />
          </div>
          <span
            className="pointer-events-none absolute inset-x-5 text-xs font-medium text-ink tabular-nums"
            style={{ top: Math.max(0, linePx - LABEL_HEIGHT) }}
          >
            {partLabel(start, at)}
          </span>
          <span
            className="pointer-events-none absolute inset-x-5 text-xs font-medium text-ink tabular-nums"
            style={{ top: Math.max(linePx + 4, BAR_HEIGHT - LABEL_HEIGHT) }}
          >
            {partLabel(at, end)}
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={split} disabled={steps < 1}>
            Split
          </Button>
        </div>
      </Modal>
    </div>
  )
}
