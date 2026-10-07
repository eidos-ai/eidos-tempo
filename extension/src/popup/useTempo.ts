import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, tempoApi } from '../api'
import { showProblem, showRunning } from '../badge'
import { addDays, startOfDay } from '../time'
import type { Client, EntrySuggestion, Project, Tag, TimeEntry, TimeEntryInput, TimerStartInput, User } from '../types'

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
  const recent = entries
    .filter((entry) => entry.stop !== null)
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
  return { running, recent, suggestions }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error.'
}

export function useTempo() {
  const [status, setStatus] = useState<Status>('loading')
  const [problem, setProblem] = useState<ApiError | null>(null)
  const [data, setData] = useState<TempoData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

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
      setData({ me, projects, clients, tags, ...activity })
      setStatus('ready')
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.kind !== 'rejected') return signOut(loadError)
      console.error('Eidos Tempo: loading failed', loadError)
      setError(describe(loadError))
    }
  }, [signOut])

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

  const queue = useRef<Promise<void>>(Promise.resolve())

  const act = (action: string, call: () => Promise<unknown>): Promise<void> => {
    const next = queue.current.then(() => run(action, call))
    queue.current = next.catch(() => undefined)
    return next
  }

  const run = async (action: string, call: () => Promise<unknown>) => {
    setIsBusy(true)
    setError(null)
    try {
      await call()
    } catch (actionError) {
      await reportFailure(action, actionError)
      setError(`${action} was not saved. ${describe(actionError)}`)
      setIsBusy(false)
      return
    }
    try {
      const activity = await fetchActivity()
      setData((current) => (current ? { ...current, ...activity } : current))
    } catch (refreshError) {
      await reportFailure('Refreshing', refreshError)
      setError(`Saved, but the popup could not refresh. ${describe(refreshError)}`)
    } finally {
      setIsBusy(false)
    }
  }

  const replacement = (entry: TimeEntry, input: TimerStartInput): TimeEntryInput => {
    const project = data?.projects.find((candidate) => candidate.id === input.project_id)
    const projectBillable = input.project_id === entry.project_id ? entry.is_billable : (project?.is_billable ?? false)
    return {
      description: input.description,
      project_id: input.project_id,
      is_billable: input.is_billable ?? projectBillable,
      tag_ids: input.tag_ids ?? entry.tag_ids,
      start: entry.start,
      stop: entry.stop,
    }
  }

  return {
    status,
    problem,
    data,
    error,
    isBusy,
    reload: () => {
      setStatus('loading')
      setError(null)
      void load()
    },
    dismissError: () => setError(null),
    createTag: async (name: string): Promise<Tag | null> => {
      try {
        const tag = await tempoApi.createTag({ name, is_archived: false })
        setData((current) => (current ? { ...current, tags: [...current.tags, tag] } : current))
        return tag
      } catch (createError) {
        await reportFailure('Creating the tag', createError)
        setError(`Creating the tag was not saved. ${describe(createError)}`)
        return null
      }
    },
    start: (input: TimerStartInput) => act('Starting the timer', () => tempoApi.start(input)),
    stop: () => act('Stopping the timer', tempoApi.stop),
    updateRunning: (entry: TimeEntry, input: TimerStartInput) =>
      act('Updating the timer', () => tempoApi.update(entry.id, replacement(entry, input))),
    updateEntries: (entries: TimeEntry[], input: TimerStartInput) =>
      act('Updating the entry', async () => {
        for (const entry of entries) await tempoApi.update(entry.id, replacement(entry, input))
      }),
  }
}
