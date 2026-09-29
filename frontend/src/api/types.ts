export type Role = 'admin' | 'member'
export type TimerView = 'calendar' | 'list'
export type CalendarZoom = 1 | 2 | 3 | 4 | 5
export type DaysShown = 5 | 7

export interface Preferences {
  calendar_zoom: CalendarZoom
  default_view: TimerView
  days_shown: DaysShown
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

export interface TimeEntry {
  id: string
  description: string
  project_id: string | null
  start: string
  stop: string | null
}

export interface TimeEntryInput {
  description: string
  project_id: string | null
  start: string
  stop: string | null
}

export interface TimerStartInput {
  description: string
  project_id: string | null
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
