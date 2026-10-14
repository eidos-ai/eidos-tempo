import type { TimeEntry } from '../../api/types'

export const SPLIT_STEP_MS = 5 * 60 * 1000

// Split points are 5-minute steps counted from the start, strictly before the end (now, for a running entry).
export function splitStepCount(start: Date, end: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / SPLIT_STEP_MS) - 1)
}

export function defaultSplitStep(start: Date, end: Date): number {
  const middle = Math.round((end.getTime() - start.getTime()) / 2 / SPLIT_STEP_MS)
  return Math.min(Math.max(middle, 1), splitStepCount(start, end))
}

export function canSplit(entry: TimeEntry, now: Date): boolean {
  return splitStepCount(new Date(entry.start), entry.stop ? new Date(entry.stop) : now) > 0
}
