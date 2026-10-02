import { http } from './client'
import type {
  Client,
  EntrySuggestion,
  ClientInput,
  Preferences,
  Project,
  ProjectInput,
  TimeEntry,
  Tag,
  TagInput,
  TimeEntryInput,
  TimerStartInput,
  TrackingStory,
  User,
  UserCreateInput,
  UserUpdateInput,
} from './types'

export const authApi = {
  login: (email: string, password: string) => http.post<User>('/auth/login', { email, password }),
  logout: () => http.post<void>('/auth/logout'),
}

export const meApi = {
  get: () => http.get<User>('/me'),
  updatePreferences: (preferences: Preferences) => http.put<User>('/me/preferences', preferences),
  changePassword: (currentPassword: string, newPassword: string) =>
    http.put<void>('/me/password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
}

export const usersApi = {
  list: () => http.get<User[]>('/users'),
  create: (input: UserCreateInput) => http.post<User>('/users', input),
  update: (id: string, input: UserUpdateInput) => http.put<User>(`/users/${id}`, input),
  resetPassword: (id: string, newPassword: string) =>
    http.put<void>(`/users/${id}/password`, { new_password: newPassword }),
}

export const clientsApi = {
  list: () => http.get<Client[]>('/clients?include_archived=true'),
  create: (input: ClientInput) => http.post<Client>('/clients', input),
  update: (id: string, input: ClientInput) => http.put<Client>(`/clients/${id}`, input),
}

export const projectsApi = {
  list: () => http.get<Project[]>('/projects?include_archived=true'),
  create: (input: ProjectInput) => http.post<Project>('/projects', input),
  update: (id: string, input: ProjectInput) => http.put<Project>(`/projects/${id}`, input),
}

export const tagsApi = {
  list: () => http.get<Tag[]>('/tags?include_archived=true'),
  create: (input: TagInput) => http.post<Tag>('/tags', input),
  update: (id: string, input: TagInput) => http.put<Tag>(`/tags/${id}`, input),
}

export const timeEntriesApi = {
  list: (start: Date, end: Date) =>
    http.get<TimeEntry[]>(
      `/time-entries?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
    ),
  running: () => http.get<TimeEntry | null>('/time-entries/running'),
  suggestions: () => http.get<EntrySuggestion[]>('/time-entries/suggestions'),
  story: (timezone: string) => http.get<TrackingStory>(`/time-entries/story?timezone=${encodeURIComponent(timezone)}`),
  start: (input: TimerStartInput) => http.post<TimeEntry>('/time-entries/start', input),
  stop: () => http.post<TimeEntry>('/time-entries/stop'),
  create: (input: TimeEntryInput) => http.post<TimeEntry>('/time-entries', input),
  update: (id: string, input: TimeEntryInput) => http.put<TimeEntry>(`/time-entries/${id}`, input),
  remove: (id: string) => http.delete(`/time-entries/${id}`),
}
