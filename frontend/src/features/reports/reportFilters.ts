import type { Grouping } from '../../api/types'
import { addDays, isoWeekNumber, startOfDay, startOfWeek } from '../../lib/time'

export type Condition = 'is' | 'is-not' | 'is-empty' | 'is-not-empty'
export type BillableChoice = 'billable' | 'non-billable'
export type ChoiceDimension = 'members' | 'clients' | 'projects' | 'tags'

export interface ChoiceFilter {
  condition: Condition
  ids: string[]
}

export interface ReportFilters {
  from: Date
  to: Date
  members: ChoiceFilter | null
  clients: ChoiceFilter | null
  projects: ChoiceFilter | null
  tags: ChoiceFilter | null
  billable: BillableChoice | null
  description: string | null
  groupBy: Grouping
  subgroupBy: Grouping
  stackBy: Grouping
  sliceBy: Grouping
}

export interface DatePreset {
  label: string
  range: (today: Date) => [Date, Date]
}

const GROUPINGS: Grouping[] = ['project', 'client', 'member', 'description', 'billable']
const CONDITIONS: Condition[] = ['is', 'is-not', 'is-empty', 'is-not-empty']
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const CHOICE_PARAMS: Record<ChoiceDimension, string> = {
  members: 'user',
  clients: 'client',
  projects: 'project',
  tags: 'tag',
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfQuarter(date: Date): Date {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1)
}

function startOfSemester(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() < 6 ? 0 : 6, 1)
}

function monthsLater(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function lastDayBefore(date: Date): Date {
  return addDays(date, -1)
}

const thisWeek = (today: Date): [Date, Date] => [startOfWeek(today), addDays(startOfWeek(today), 6)]

export const DATE_PRESETS: DatePreset[] = [
  { label: 'Today', range: (today) => [today, today] },
  { label: 'This week', range: thisWeek },
  { label: 'This month', range: (today) => [startOfMonth(today), lastDayBefore(monthsLater(today, 1))] },
  { label: 'This year', range: (today) => [new Date(today.getFullYear(), 0, 1), new Date(today.getFullYear(), 11, 31)] },
  { label: 'Last week', range: (today) => [addDays(startOfWeek(today), -7), addDays(startOfWeek(today), -1)] },
  { label: 'Last month', range: (today) => [monthsLater(today, -1), lastDayBefore(startOfMonth(today))] },
]

export const MORE_DATE_PRESETS: DatePreset[] = [
  { label: 'Yesterday', range: (today) => [addDays(today, -1), addDays(today, -1)] },
  { label: 'This quarter', range: (today) => [startOfQuarter(today), lastDayBefore(monthsLater(startOfQuarter(today), 3))] },
  { label: 'This semester', range: (today) => [startOfSemester(today), lastDayBefore(monthsLater(startOfSemester(today), 6))] },
  { label: 'Last quarter', range: (today) => [monthsLater(startOfQuarter(today), -3), lastDayBefore(startOfQuarter(today))] },
  { label: 'Last semester', range: (today) => [monthsLater(startOfSemester(today), -6), lastDayBefore(startOfSemester(today))] },
  { label: 'Last year', range: (today) => [new Date(today.getFullYear() - 1, 0, 1), new Date(today.getFullYear() - 1, 11, 31)] },
  { label: 'Last 2 weeks', range: (today) => [addDays(startOfWeek(today), -14), addDays(startOfWeek(today), -1)] },
  { label: 'Last 30 days', range: (today) => [addDays(today, -29), today] },
  { label: 'Last 90 days', range: (today) => [addDays(today, -89), today] },
  { label: 'Last 12 mths', range: (today) => [monthsLater(today, -11), lastDayBefore(monthsLater(today, 1))] },
  { label: 'Week to today', range: (today) => [startOfWeek(today), today] },
  { label: 'Month to today', range: (today) => [startOfMonth(today), today] },
  { label: 'Quarter to today', range: (today) => [startOfQuarter(today), today] },
  { label: 'Semester to today', range: (today) => [startOfSemester(today), today] },
  { label: 'Year to today', range: (today) => [new Date(today.getFullYear(), 0, 1), today] },
]

export function toDateParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseDateParam(value: string | null): Date | null {
  const match = value ? DATE_PATTERN.exec(value) : null
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

export function presetLabel(from: Date, to: Date): string | null {
  const today = startOfDay(new Date())
  const preset = [...DATE_PRESETS, ...MORE_DATE_PRESETS].find(({ range }) => {
    const [start, end] = range(today)
    return start.getTime() === from.getTime() && end.getTime() === to.getTime()
  })
  return preset?.label ?? null
}

export function weekSuffix(from: Date, to: Date): string | null {
  const isWholeWeek = from.getDay() === 1 && addDays(from, 6).getTime() === to.getTime()
  return isWholeWeek ? `W${isoWeekNumber(from)}` : null
}

export function shiftRange(from: Date, to: Date, direction: 1 | -1): [Date, Date] {
  const isWholeMonths = from.getDate() === 1 && addDays(to, 1).getDate() === 1
  if (isWholeMonths) {
    const months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + 1
    const start = new Date(from.getFullYear(), from.getMonth() + direction * months, 1)
    return [start, new Date(start.getFullYear(), start.getMonth() + months, 0)]
  }
  const days = Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000) + 1
  return [addDays(from, direction * days), addDays(to, direction * days)]
}

function oneOf<T extends string>(value: string | null, options: T[], fallback: T): T {
  return options.find((option) => option === value) ?? fallback
}

function readChoice(value: string | null): ChoiceFilter | null {
  if (!value) return null
  const [rawCondition, rawIds = ''] = value.split(':')
  const condition = oneOf(rawCondition, CONDITIONS, 'is')
  const ids = rawIds.split(',').filter(Boolean)
  if ((condition === 'is' || condition === 'is-not') && ids.length === 0) return null
  return { condition, ids: condition === 'is' || condition === 'is-not' ? ids : [] }
}

function writeChoice(choice: ChoiceFilter): string {
  return choice.ids.length > 0 ? `${choice.condition}:${choice.ids.join(',')}` : choice.condition
}

export function readFilters(params: URLSearchParams): ReportFilters {
  const [weekStart, weekEnd] = thisWeek(startOfDay(new Date()))
  const from = parseDateParam(params.get('from')) ?? weekStart
  const to = parseDateParam(params.get('to')) ?? weekEnd
  const billable = params.get('billable')
  return {
    from,
    to: to < from ? from : to,
    members: readChoice(params.get('members')),
    clients: readChoice(params.get('clients')),
    projects: readChoice(params.get('projects')),
    tags: readChoice(params.get('tags')),
    billable: billable === 'billable' || billable === 'non-billable' ? billable : null,
    description: params.get('description'),
    groupBy: oneOf(params.get('group'), GROUPINGS, 'project'),
    subgroupBy: oneOf(params.get('subgroup'), GROUPINGS, 'member'),
    stackBy: oneOf(params.get('stack'), GROUPINGS, 'billable'),
    sliceBy: oneOf(params.get('slice'), GROUPINGS, 'project'),
  }
}

export function writeFilters(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams({ from: toDateParam(filters.from), to: toDateParam(filters.to) })
  for (const dimension of ['members', 'clients', 'projects', 'tags'] as const) {
    const choice = filters[dimension]
    if (choice) params.set(dimension, writeChoice(choice))
  }
  if (filters.billable) params.set('billable', filters.billable)
  if (filters.description !== null) params.set('description', filters.description)
  if (filters.groupBy !== 'project') params.set('group', filters.groupBy)
  if (filters.subgroupBy !== 'member') params.set('subgroup', filters.subgroupBy)
  if (filters.stackBy !== 'billable') params.set('stack', filters.stackBy)
  if (filters.sliceBy !== 'project') params.set('slice', filters.sliceBy)
  return params
}

export function toApiQuery(filters: ReportFilters): string {
  const params = new URLSearchParams({
    start: filters.from.toISOString(),
    end: addDays(filters.to, 1).toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
  for (const dimension of ['members', 'clients', 'projects', 'tags'] as const) {
    const choice = filters[dimension]
    if (!choice) continue
    const name = CHOICE_PARAMS[dimension]
    for (const id of choice.ids) params.append(`${name}_id`, id)
    if (choice.condition === 'is-empty' || choice.condition === 'is-not-empty') params.set(`without_${name}`, 'true')
    if (choice.condition === 'is-not' || choice.condition === 'is-not-empty') params.set(`exclude_${name}s`, 'true')
  }
  if (filters.billable) params.set('billable', String(filters.billable === 'billable'))
  if (filters.description) params.set('description', filters.description)
  return params.toString()
}

export function toSummaryQuery(filters: ReportFilters): string {
  const layout = new URLSearchParams({
    group_by: filters.groupBy,
    subgroup_by: filters.subgroupBy,
    stack_by: filters.stackBy,
    slice_by: filters.sliceBy,
  })
  return `${toApiQuery(filters)}&${layout.toString()}`
}
