import type { TimeEntry } from '../../api/types'
import { addDays, entryEnd } from '../../lib/time'

const OVERLAP_TOLERANCE_MS = 60_000
const MS_PER_MINUTE = 60_000

export interface DaySegment {
  entry: TimeEntry
  start: Date
  end: Date
  startsHere: boolean
  endsHere: boolean
  lane: number
  laneCount: number
  nextStart: Date | null
}

function floorToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE)
}

export function segmentsForDay(entries: TimeEntry[], day: Date, now: Date): DaySegment[] {
  const dayEnd = addDays(day, 1)
  const segments = entries
    .filter((entry) => {
      const start = new Date(entry.start)
      const end = entryEnd(entry, now)
      const isVisibleRunning = entry.stop === null && start < dayEnd && start >= day
      return (end > day && start < dayEnd && end > start) || isVisibleRunning
    })
    .map((entry) => {
      const start = new Date(entry.start)
      const end = entryEnd(entry, now)
      return {
        entry,
        start: floorToMinute(new Date(Math.max(start.getTime(), day.getTime()))),
        end: floorToMinute(new Date(Math.min(end.getTime(), dayEnd.getTime()))),
        startsHere: start >= day,
        endsHere: entry.stop !== null && end <= dayEnd,
        lane: 0,
        laneCount: 1,
        nextStart: null,
      }
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime())

  assignLanes(segments)
  assignNextStarts(segments)
  return segments
}

function sharesColumn(a: DaySegment, b: DaySegment): boolean {
  return a.lane / a.laneCount < (b.lane + 1) / b.laneCount && b.lane / b.laneCount < (a.lane + 1) / a.laneCount
}

// A short entry is drawn taller than its duration; this is where it must stop so it doesn't cover the next one.
function assignNextStarts(segments: DaySegment[]): void {
  segments.forEach((segment, index) => {
    const next = segments
      .slice(index + 1)
      .find((other) => other.start >= segment.end && sharesColumn(segment, other))
    segment.nextStart = next?.start ?? null
  })
}

function assignLanes(segments: DaySegment[]): void {
  let cluster: DaySegment[] = []
  let laneEnds: number[] = []
  let clusterEnd = -Infinity

  const closeCluster = () => {
    for (const segment of cluster) segment.laneCount = laneEnds.length
    cluster = []
    laneEnds = []
  }

  for (const segment of segments) {
    const start = segment.start.getTime()
    if (start >= clusterEnd - OVERLAP_TOLERANCE_MS) closeCluster()
    const freeLane = laneEnds.findIndex((end) => end - OVERLAP_TOLERANCE_MS <= start)
    segment.lane = freeLane === -1 ? laneEnds.length : freeLane
    laneEnds[segment.lane] = segment.end.getTime()
    clusterEnd = Math.max(clusterEnd, segment.end.getTime())
    cluster.push(segment)
  }
  closeCluster()
}
