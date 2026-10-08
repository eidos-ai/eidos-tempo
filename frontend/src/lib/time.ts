import type { TimeEntry } from '../api/types'

const MS_PER_SECOND = 1000
const MS_PER_MINUTE = 60 * MS_PER_SECOND
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function shiftDays(date: Date, days: number): Date {
  const shifted = new Date(date)
  shifted.setDate(shifted.getDate() + days)
  return shifted
}

export function startOfWeek(date: Date): Date {
  const daysSinceMonday = (date.getDay() + 6) % 7
  return addDays(startOfDay(date), -daysSinceMonday)
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

export function isoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNumber = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil(((target.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7)
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MS_PER_MINUTE)
}

export function minutesSinceStartOfDay(date: Date): number {
  return (date.getTime() - startOfDay(date).getTime()) / MS_PER_MINUTE
}

export function entryEnd(entry: TimeEntry, now: Date): Date {
  return entry.stop ? new Date(entry.stop) : now
}

export function entrySeconds(entry: TimeEntry, now: Date): number {
  const seconds = (entryEnd(entry, now).getTime() - new Date(entry.start).getTime()) / MS_PER_SECOND
  return Math.max(0, Math.floor(seconds))
}

export function secondsWithin(entry: TimeEntry, rangeStart: Date, rangeEnd: Date, now: Date): number {
  const start = Math.max(new Date(entry.start).getTime(), rangeStart.getTime())
  const end = Math.min(entryEnd(entry, now).getTime(), rangeEnd.getTime())
  return Math.max(0, Math.floor((end - start) / MS_PER_SECOND))
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatHourLabel(hour: number): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatDayHeading(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function toTimeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function withTimeOfDay(date: Date, value: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(match[1]), Number(match[2]))
}

export type Meridiem = 'AM' | 'PM'

export interface ClockTime {
  value: string
  meridiem: Meridiem
}

export function toTwelveHour(value: string): { text: string; meridiem: Meridiem } {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return { text: '', meridiem: 'AM' }
  const hours = Number(match[1])
  return { text: `${hours % 12 || 12}:${match[2]}`, meridiem: hours >= 12 ? 'PM' : 'AM' }
}

const CLOCK_TEXT = /^(\d{1,2})(?:(?:[:.,]|\s+)(\d{1,2})|(\d{2}))?\s*(?:([ap])\.?(?:m\.?)?)?$/i

export function parseClockText(text: string, meridiem: Meridiem): ClockTime | null {
  const match = CLOCK_TEXT.exec(text.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2] ?? match[3] ?? 0)
  if (hours > 23 || minutes > 59) return null
  const isTwentyFourHour = hours === 0 || hours > 12
  const suffix = match[4]?.toUpperCase()
  const chosen: Meridiem = isTwentyFourHour ? (hours >= 12 ? 'PM' : 'AM') : suffix ? (suffix === 'A' ? 'AM' : 'PM') : meridiem
  const hours24 = isTwentyFourHour ? hours : (hours % 12) + (chosen === 'PM' ? 12 : 0)
  return { value: `${String(hours24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`, meridiem: chosen }
}
