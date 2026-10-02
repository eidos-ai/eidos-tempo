export type Theme = 'light' | 'dark'

export interface User {
  id: string
  full_name: string
  preferences: { theme: Theme }
}

export interface Client {
  id: string
  name: string
}

export interface Project {
  id: string
  name: string
  color: string
  client_id: string | null
  is_billable: boolean
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

export interface EntrySuggestion {
  description: string
  project_id: string | null
}

export interface TimerStartInput {
  description: string
  project_id: string | null
}
