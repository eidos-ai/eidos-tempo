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

export function shiftDays(date: Date, days: number): Date {
  const shifted = new Date(date)
  shifted.setDate(shifted.getDate() + days)
  return shifted
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

export function secondsBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
}

const CLOCK_DURATION = /^(\d+)(?::(\d{1,2}))?(?::(\d{1,2}))?$/
const DECIMAL_HOURS = /^\d+[.,]\d+$/

export function parseDuration(text: string): number | null {
  const trimmed = text.trim()
  if (DECIMAL_HOURS.test(trimmed)) return Math.round(Number(trimmed.replace(',', '.')) * 3600)
  const match = CLOCK_DURATION.exec(trimmed)
  if (!match) return null
  const [hours, minutes = '0', seconds = '0'] = match.slice(1)
  if (Number(minutes) > 59 || Number(seconds) > 59) return null
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}

export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatShortDay(day: Date, today: Date): string {
  return isSameDay(day, today) ? 'Today' : day.toLocaleDateString([], { month: '2-digit', day: '2-digit' })
}

export function toTimeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function atTimeOf(day: Date, source: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), source.getHours(), source.getMinutes(), source.getSeconds())
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
