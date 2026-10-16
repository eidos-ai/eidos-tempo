export type Theme = 'light' | 'dark'

export interface User {
  id: string
  full_name: string
  preferences: { theme: Theme }
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
