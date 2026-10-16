import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, tempoApi } from './api'
import { showProblem, showRunning } from './shell'
import { addDays, startOfDay } from './time'
import type { Client, EntrySuggestion, Project, Tag, TimeEntry, TimeEntryInput, TimerStartInput, User } from './types'

const RECENT_DAYS = 7

export type Status = 'loading' | 'ready' | 'signed-out'

export interface TempoData {
  me: User
  running: TimeEntry | null
  recent: TimeEntry[]
  projects: Project[]
  clients: Client[]
  tags: Tag[]
  suggestions: EntrySuggestion[]
}

interface Activity {
  running: TimeEntry | null
  recent: TimeEntry[]
  suggestions: EntrySuggestion[]
}

async function fetchActivity(): Promise<Activity> {
  const today = startOfDay(new Date())
  const [running, entries, suggestions] = await Promise.all([
    tempoApi.running(),
    tempoApi.entries(addDays(today, 1 - RECENT_DAYS), addDays(today, 1)),
    tempoApi.suggestions(),
  ])
  await showRunning(running)
  return { running, recent: newestFirst(entries.filter((entry) => entry.stop !== null)), suggestions }
}

function newestFirst(entries: TimeEntry[]): TimeEntry[] {
  return [...entries].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error.'
}

const OPTIMISTIC_ID_PREFIX = 'optimistic-'

type Change = (data: TempoData) => TempoData

function stopRunning(data: TempoData, stop: string): TempoData {
  if (!data.running) return data
  return { ...data, running: null, recent: [{ ...data.running, stop }, ...data.recent] }
}

export function useTempo() {
  const [status, setStatus] = useState<Status>('loading')
  const [problem, setProblem] = useState<ApiError | null>(null)
  const [data, setData] = useState<TempoData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dataRef = useRef<TempoData | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const pending = useRef(0)
  // Optimistic entry id -> the entry the server created, for changes queued before it existed.
  const created = useRef(new Map<string, TimeEntry>())

  const setTempo = useCallback((update: (current: TempoData | null) => TempoData | null) => {
    setData((current) => {
      const next = update(current)
      dataRef.current = next
      return next
    })
  }, [])

  const signOut = useCallback(async (apiError: ApiError) => {
    await showProblem()
    setProblem(apiError)
    setStatus('signed-out')
  }, [])

  const load = useCallback(async () => {
    try {
      const [me, projects, clients, tags, activity] = await Promise.all([
        tempoApi.me(),
        tempoApi.projects(),
        tempoApi.clients(),
        tempoApi.tags(),
        fetchActivity(),
      ])
      setTempo(() => ({ me, projects, clients, tags, ...activity }))
      setStatus('ready')
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.kind !== 'rejected') return signOut(loadError)
      console.error('Eidos Tempo: loading failed', loadError)
      setError(describe(loadError))
    }
  }, [signOut, setTempo])

  useEffect(() => {
    // Fetching from the server is the external system this effect syncs with; state is set after the response.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  const reportFailure = async (action: string, failure: unknown) => {
    if (failure instanceof ApiError && failure.kind === 'not-logged-in') await signOut(failure)
    else if (failure instanceof ApiError && failure.kind === 'unreachable') await showProblem()
    else console.error(`Eidos Tempo: ${action} failed`, failure)
  }

  const refresh = async () => {
    const activity = await fetchActivity()
    setTempo((current) => (current ? { ...current, ...activity } : current))
  }

  // The change shows at once; the request is sent in order behind earlier ones. On failure the popup
  // goes back to what the server has (or to before the change if the server can't be reached).
  // Resolves to whether the server saved the change.
  const act = (action: string, change: Change, call: () => Promise<unknown>): Promise<boolean> => {
    const before = dataRef.current
    if (!before) return Promise.resolve(false)
    const after = change(before)
    setTempo(() => after)
    setError(null)
    void showRunning(after.running)
    pending.current += 1
    const next = queue.current.then(async () => {
      try {
        await call()
      } catch (actionError) {
        setError(`${action} was not saved. ${describe(actionError)}`)
        try {
          await refresh()
        } catch {
          setTempo(() => before)
          await showRunning(before.running)
        }
        await reportFailure(action, actionError)
        return false
      } finally {
        pending.current -= 1
      }
      if (pending.current > 0) return true
      try {
        await refresh()
      } catch (refreshError) {
        await reportFailure('Refreshing', refreshError)
        setError(`Saved, but the popup could not refresh. ${describe(refreshError)}`)
      }
      return true
    })
    queue.current = next.then(() => undefined, () => undefined)
    return next
  }

  // The entry as shown, under the id the server gave it (its stop may only exist in the popup so far).
  // The server's start replaces the click time unless the start was edited since.
  const saved = (entry: TimeEntry): TimeEntry => {
    const server = created.current.get(entry.id)
    if (!server) return entry
    const keepsClickTime = entry.id === `${OPTIMISTIC_ID_PREFIX}${entry.start}`
    return { ...entry, id: server.id, start: keepsClickTime ? server.start : entry.start }
  }

  const replacement = (entry: TimeEntry, input: TimerStartInput): TimeEntryInput => {
    const project = dataRef.current?.projects.find((candidate) => candidate.id === input.project_id)
    const projectBillable = input.project_id === entry.project_id ? entry.is_billable : (project?.is_billable ?? false)
    return {
      description: input.description,
      project_id: input.project_id,
      is_billable: input.is_billable ?? projectBillable,
      tag_ids: input.tag_ids ?? entry.tag_ids,
      start: input.start ?? entry.start,
      stop: entry.stop,
    }
  }

  const start = (input: TimerStartInput) => {
    const now = new Date().toISOString()
    const id = `${OPTIMISTIC_ID_PREFIX}${now}`
    const project = dataRef.current?.projects.find((candidate) => candidate.id === input.project_id)
    const entry: TimeEntry = {
      id,
      description: input.description,
      project_id: input.project_id,
      is_billable: input.is_billable ?? project?.is_billable ?? false,
      tag_ids: input.tag_ids ?? [],
      start: now,
      stop: null,
    }
    return act(
      'Starting the timer',
      (current) => ({ ...stopRunning(current, now), running: entry }),
      async () => created.current.set(id, await tempoApi.start({ ...input, start: now })),
    )
  }

  const stop = () => {
    const now = new Date().toISOString()
    return act('Stopping the timer', (current) => stopRunning(current, now), () => tempoApi.stop(now))
  }

  return {
    status,
    problem,
    data,
    error,
    reload: () => {
      setStatus('loading')
      setError(null)
      void load()
    },
    dismissError: () => setError(null),
    createTag: async (name: string): Promise<Tag | null> => {
      try {
        const tag = await tempoApi.createTag({ name, is_archived: false })
        setTempo((current) => (current ? { ...current, tags: [...current.tags, tag] } : current))
        return tag
      } catch (createError) {
        await reportFailure('Creating the tag', createError)
        setError(`Creating the tag was not saved. ${describe(createError)}`)
        return null
      }
    },
    start,
    stop,
    updateRunning: (entry: TimeEntry, input: TimerStartInput) =>
      act(
        'Updating the timer',
        (current) => ({
          ...current,
          running: current.running?.id === entry.id ? { ...current.running, ...replacement(entry, input) } : current.running,
        }),
        () => {
          const target = saved(entry)
          return tempoApi.update(target.id, replacement(target, input))
        },
      ),
    updateEntry: (entry: TimeEntry, input: TimeEntryInput) =>
      act(
        'Updating the entry',
        (current) => ({
          ...current,
          recent: newestFirst(current.recent.map((candidate) => (candidate.id === entry.id ? { ...candidate, ...input } : candidate))),
        }),
        () => tempoApi.update(saved(entry).id, input),
      ),
  }
}
