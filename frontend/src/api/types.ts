export type Role = 'admin' | 'member'
export type TimerView = 'calendar' | 'list'
export type CalendarZoom = 1 | 2 | 3 | 4 | 5
export type DaysShown = 5 | 7
export type Theme = 'light' | 'dark'

export interface Preferences {
  calendar_zoom: CalendarZoom
  default_view: TimerView
  days_shown: DaysShown
  theme: Theme
}

export interface User {
  id: string
  email: string
  full_name: string
  role: Role
  is_active: boolean
  preferences: Preferences
  created_at: string
}

export interface Client {
  id: string
  name: string
  is_archived: boolean
}

export interface ClientInput {
  name: string
  is_archived: boolean
}

export interface Project {
  id: string
  name: string
  color: string
  client_id: string | null
  is_billable: boolean
  is_archived: boolean
}

export interface ProjectInput {
  name: string
  color: string
  client_id: string | null
  is_billable: boolean
  is_archived: boolean
}

export interface Tag {
  id: string
  name: string
  is_archived: boolean
}

export interface TagInput {
  name: string
  is_archived: boolean
}

export interface TimeEntry {
  id: string
  description: string
  project_id: string | null
  is_billable: boolean
  tag_ids: string[]
  start: string
  stop: string | null
}

export interface TimeEntryInput {
  description: string
  project_id: string | null
  is_billable: boolean
  tag_ids: string[]
  start: string
  stop: string | null
}

export interface EntrySuggestion {
  description: string
  project_id: string | null
}

export interface TrackingStory {
  first_day: string | null
  total_seconds: number
  entry_count: number
  days_tracked: number
  longest_streak: number
  favorite_weekday: number | null
  top_projects: { project_id: string | null; seconds: number }[]
  busiest_day: { day: string; seconds: number } | null
  longest_entry: { description: string; project_id: string | null; start: string; seconds: number } | null
}

export interface TimerStartInput {
  description: string
  project_id: string | null
  is_billable?: boolean
  tag_ids?: string[]
}

export interface UserCreateInput {
  email: string
  full_name: string
  password: string
  role: Role
}

export interface UserUpdateInput {
  full_name: string
  role: Role
  is_active: boolean
}

export type Grouping = 'project' | 'client' | 'member' | 'description' | 'billable'
export type Resolution = 'day' | 'week' | 'month'

export interface ReportEntry extends TimeEntry {
  user_id: string
}

export interface Duration {
  seconds: number
  billable_seconds: number
}

export interface SummaryGroup extends Duration {
  key: string | null
  subgroups: SummaryGroup[]
}

export interface Share {
  key: string | null
  seconds: number
}

export interface SummaryReport {
  total: Duration
  entry_count: number
  days_tracked: number
  average_daily_seconds: number
  resolution: Resolution
  buckets: Array<Duration & { start: string; segments: Share[] }>
  stack_by: Grouping
  slice_by: Grouping
  slices: Share[]
  group_by: Grouping
  subgroup_by: Grouping
  groups: SummaryGroup[]
}

export type ReportKind = 'summary' | 'detailed'
