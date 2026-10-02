import { useCallback, useEffect, useState } from 'react'
import { ApiError, tempoApi } from '../api'
import { showProblem, showRunning } from '../badge'
import { addDays, startOfDay } from '../time'
import type { Client, EntrySuggestion, Project, TimeEntry, TimerStartInput, User } from '../types'

const RECENT_DAYS = 7

export type Status = 'loading' | 'ready' | 'signed-out'

export interface TempoData {
  me: User
  running: TimeEntry | null
  recent: TimeEntry[]
  projects: Project[]
  clients: Client[]
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
      const [me, projects, clients, activity] = await Promise.all([
        tempoApi.me(),
        tempoApi.projects(),
        tempoApi.clients(),
        fetchActivity(),
      ])
      setData({ me, projects, clients, ...activity })
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

  const act = async (action: string, call: () => Promise<unknown>) => {
    setIsBusy(true)
    setError(null)
    try {
      await call()
      const activity = await fetchActivity()
      setData((current) => (current ? { ...current, ...activity } : current))
    } catch (actionError) {
      if (actionError instanceof ApiError && actionError.kind === 'not-logged-in') await signOut(actionError)
      else if (actionError instanceof ApiError && actionError.kind === 'unreachable') await showProblem()
      else console.error(`Eidos Tempo: ${action} failed`, actionError)
      setError(`${action} was not saved. ${describe(actionError)}`)
    } finally {
      setIsBusy(false)
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
    start: (input: TimerStartInput) => act('Starting the timer', () => tempoApi.start(input)),
    stop: () => act('Stopping the timer', tempoApi.stop),
    updateRunning: (entry: TimeEntry, input: TimerStartInput) => {
      const project = data?.projects.find((candidate) => candidate.id === input.project_id)
      const isBillable = input.project_id === entry.project_id ? entry.is_billable : (project?.is_billable ?? false)
      return act('Updating the timer', () =>
        tempoApi.update(entry.id, {
          description: input.description,
          project_id: input.project_id,
          is_billable: isBillable,
          tag_ids: entry.tag_ids,
          start: entry.start,
          stop: null,
        }),
      )
    },
  }
}
