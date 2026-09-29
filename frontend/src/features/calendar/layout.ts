import type { TimeEntry } from '../../api/types'
import { addDays, entryEnd } from '../../lib/time'

export interface DaySegment {
  entry: TimeEntry
  start: Date
  end: Date
  lane: number
  laneCount: number
}

export function segmentsForDay(entries: TimeEntry[], day: Date, now: Date): DaySegment[] {
  const dayEnd = addDays(day, 1)
  const segments = entries
    .map((entry) => {
      const start = new Date(Math.max(new Date(entry.start).getTime(), day.getTime()))
      const end = new Date(Math.min(entryEnd(entry, now).getTime(), dayEnd.getTime()))
      return { entry, start, end, lane: 0, laneCount: 1 }
    })
    .filter((segment) => segment.end > segment.start || (segment.entry.stop === null && segment.start < dayEnd && segment.start >= day))
    .sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime())

  assignLanes(segments)
  return segments
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
    if (start >= clusterEnd) closeCluster()
    const freeLane = laneEnds.findIndex((end) => end <= start)
    segment.lane = freeLane === -1 ? laneEnds.length : freeLane
    laneEnds[segment.lane] = segment.end.getTime()
    clusterEnd = Math.max(clusterEnd, segment.end.getTime())
    cluster.push(segment)
  }
  closeCluster()
}
