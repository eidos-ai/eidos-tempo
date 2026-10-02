import { getServerUrl } from './config'
import type { Client, EntrySuggestion, Project, TimeEntry, TimeEntryInput, TimerStartInput, User } from './types'

export type ApiErrorKind = 'not-logged-in' | 'unreachable' | 'rejected'

export class ApiError extends Error {
  readonly kind: ApiErrorKind

  constructor(kind: ApiErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

const GATEWAY_STATUSES = new Set([502, 503, 504])

async function readDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
  } catch {
    // Not JSON; fall back to the status text.
  }
  return response.statusText || `Request failed (${response.status})`
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const serverUrl = await getServerUrl()
  let response: Response
  try {
    response = await fetch(`${serverUrl}/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('unreachable', `Can't reach Eidos Tempo at ${serverUrl}.`)
  }
  if (response.status === 401) throw new ApiError('not-logged-in', 'You are not logged in to Eidos Tempo.')
  if (GATEWAY_STATUSES.has(response.status)) {
    throw new ApiError('unreachable', `Eidos Tempo at ${serverUrl} is not responding.`)
  }
  if (!response.ok) throw new ApiError('rejected', await readDetail(response))
  return (await response.json()) as T
}

export const tempoApi = {
  me: () => request<User>('GET', '/me'),
  clients: () => request<Client[]>('GET', '/clients'),
  projects: () => request<Project[]>('GET', '/projects'),
  running: () => request<TimeEntry | null>('GET', '/time-entries/running'),
  entries: (start: Date, end: Date) =>
    request<TimeEntry[]>(
      'GET',
      `/time-entries?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
    ),
  suggestions: () => request<EntrySuggestion[]>('GET', '/time-entries/suggestions'),
  start: (input: TimerStartInput) => request<TimeEntry>('POST', '/time-entries/start', input),
  stop: () => request<TimeEntry>('POST', '/time-entries/stop'),
  update: (id: string, input: TimeEntryInput) => request<TimeEntry>('PUT', `/time-entries/${id}`, input),
}
