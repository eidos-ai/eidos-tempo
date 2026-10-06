import type { TimeEntry } from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function startOfWeek(date: Date): Date {
  const daysSinceMonday = (date.getDay() + 6) % 7
  return addDays(startOfDay(date), -daysSinceMonday)
}

export function secondsSince(entry: TimeEntry, rangeStart: Date, now: Date): number {
  const start = Math.max(new Date(entry.start).getTime(), rangeStart.getTime())
  const end = entry.stop ? new Date(entry.stop).getTime() : now.getTime()
  return Math.max(0, Math.floor((end - start) / 1000))
}

export function entrySeconds(entry: TimeEntry, now: Date): number {
  const end = entry.stop ? new Date(entry.stop) : now
  return Math.max(0, Math.floor((end.getTime() - new Date(entry.start).getTime()) / 1000))
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function dayLabel(day: Date, today: Date): string {
  const daysAgo = Math.round((startOfDay(today).getTime() - day.getTime()) / MS_PER_DAY)
  if (daysAgo === 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  return day.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
