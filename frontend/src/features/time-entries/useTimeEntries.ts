import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { timeEntriesApi } from '../../api/endpoints'
import { queryKeys } from '../../api/queryKeys'
import type { ReportEntry, TimeEntry, TimeEntryInput, TimerStartInput } from '../../api/types'
import { addDays } from '../../lib/time'
import { showToast } from '../../lib/toast'

const OPTIMISTIC_ID_PREFIX = 'optimistic-'
const SYNC_INTERVAL_MS = 30_000
let lastEntryChange: Promise<unknown> = Promise.resolve()

type EntriesUpdater = <T extends TimeEntry>(entries: T[]) => T[]

interface Snapshot {
  weeks: Array<[readonly unknown[], TimeEntry[] | undefined]>
  reports: Array<[readonly unknown[], ReportEntry[] | undefined]>
  running: TimeEntry | null | undefined
}

function fetchWeek(weekStart: Date): Promise<TimeEntry[]> {
  return timeEntriesApi.list(weekStart, addDays(weekStart, 7))
}

export function isOptimistic(entry: TimeEntry): boolean {
  return entry.id.startsWith(OPTIMISTIC_ID_PREFIX)
}

export function useWeekEntries(weekStart: Date) {
  const queryClient = useQueryClient()

  useEffect(() => {
    for (const offset of [-7, 7]) {
      const neighbour = addDays(weekStart, offset)
      void queryClient.prefetchQuery({ queryKey: queryKeys.week(neighbour), queryFn: () => fetchWeek(neighbour) })
    }
  }, [queryClient, weekStart])

  return useQuery({
    queryKey: queryKeys.week(weekStart),
    queryFn: () => fetchWeek(weekStart),
    placeholderData: (previous) => previous,
    refetchInterval: () => syncInterval(queryClient),
  })
}

export function useRunningEntry() {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: queryKeys.runningEntry,
    queryFn: timeEntriesApi.running,
    refetchInterval: () => syncInterval(queryClient),
  })
}

function syncInterval(queryClient: QueryClient): number | false {
  return queryClient.isMutating({ mutationKey: queryKeys.timeEntries }) > 0 ? false : SYNC_INTERVAL_MS
}

async function snapshot(queryClient: QueryClient): Promise<Snapshot> {
  await queryClient.cancelQueries({ queryKey: queryKeys.timeEntries })
  return {
    weeks: queryClient.getQueriesData<TimeEntry[]>({ queryKey: queryKeys.weekEntries }),
    reports: queryClient.getQueriesData<ReportEntry[]>({ queryKey: queryKeys.reportEntries }),
    running: queryClient.getQueryData<TimeEntry | null>(queryKeys.runningEntry),
  }
}

function restore(queryClient: QueryClient, previous: Snapshot | undefined): void {
  if (!previous) return
  for (const [key, data] of [...previous.weeks, ...previous.reports]) queryClient.setQueryData(key, data)
  queryClient.setQueryData(queryKeys.runningEntry, previous.running)
}

function updateWeeks(queryClient: QueryClient, updater: EntriesUpdater): void {
  queryClient.setQueriesData<TimeEntry[]>({ queryKey: queryKeys.weekEntries }, (entries) =>
    entries ? updater(entries) : entries,
  )
  queryClient.setQueriesData<ReportEntry[]>({ queryKey: queryKeys.reportEntries }, (entries) =>
    entries ? updater(entries) : entries,
  )
}

function insertIntoWeeks(queryClient: QueryClient, entry: TimeEntry): void {
  const start = new Date(entry.start)
  for (const [key] of queryClient.getQueriesData<TimeEntry[]>({ queryKey: queryKeys.weekEntries })) {
    const weekStart = new Date(String(key[2]))
    if (start >= weekStart && start < addDays(weekStart, 7)) {
      queryClient.setQueryData<TimeEntry[]>(key, (entries) => [entry, ...(entries ?? [])])
    }
  }
}

// Entry changes reach the server in the order the user made them (e.g. save description, then stop).
// Not a TanStack mutation `scope`: queued scoped mutations stay paused while the tab is hidden.
function inOrder<T>(send: () => Promise<T>): Promise<T> {
  const result = lastEntryChange.then(send, send)
  lastEntryChange = result.catch(() => undefined)
  return result
}

function useEntryMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
  applyOptimistic: (queryClient: QueryClient, variables: TVariables) => void,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: queryKeys.timeEntries,
    mutationFn: (variables: TVariables) => inOrder(() => mutationFn(variables)),
    onMutate: async (variables: TVariables) => {
      const previous = await snapshot(queryClient)
      applyOptimistic(queryClient, variables)
      return previous
    },
    onError: (error, _variables, previous) => {
      restore(queryClient, previous)
      showToast(error.message)
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: queryKeys.timeEntries }) === 1) {
        return queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries })
      }
    },
  })
}

// Start and stop send the click time, so the saved entry matches what the timer showed even when the
// request waits behind earlier saves.
export function useStartTimer() {
  const mutation = useEntryMutation(timeEntriesApi.start, (queryClient, input: TimerStartInput) => {
    const now = input.start ?? new Date().toISOString()
    const running = queryClient.getQueryData<TimeEntry | null>(queryKeys.runningEntry)
    if (running) {
      updateWeeks(queryClient, (entries) => entries.map((e) => (e.id === running.id ? { ...e, stop: now } : e)))
    }
    const entry: TimeEntry = {
      id: `${OPTIMISTIC_ID_PREFIX}${now}`,
      description: input.description,
      project_id: input.project_id,
      is_billable: input.is_billable ?? false,
      tag_ids: input.tag_ids ?? [],
      start: now,
      stop: null,
    }
    queryClient.setQueryData(queryKeys.runningEntry, entry)
    insertIntoWeeks(queryClient, entry)
  })
  return { ...mutation, mutate: (input: TimerStartInput) => mutation.mutate({ ...input, start: new Date().toISOString() }) }
}

export function useStopTimer() {
  const mutation = useEntryMutation(timeEntriesApi.stop, (queryClient, stop: string) => {
    const running = queryClient.getQueryData<TimeEntry | null>(queryKeys.runningEntry)
    if (!running) return
    updateWeeks(queryClient, (entries) => entries.map((e) => (e.id === running.id ? { ...e, stop } : e)))
    queryClient.setQueryData(queryKeys.runningEntry, null)
  })
  return { ...mutation, mutate: () => mutation.mutate(new Date().toISOString()) }
}

export function useCreateEntry() {
  return useEntryMutation(timeEntriesApi.create, (queryClient, input: TimeEntryInput) => {
    insertIntoWeeks(queryClient, { id: `${OPTIMISTIC_ID_PREFIX}${Date.now()}`, ...input })
  })
}

export function useUpdateEntry() {
  return useEntryMutation(
    ({ id, input }: { id: string; input: TimeEntryInput }) => timeEntriesApi.update(id, input),
    (queryClient, { id, input }) => {
      updateWeeks(queryClient, (entries) => entries.map((e) => (e.id === id ? { ...e, ...input } : e)))
      const running = queryClient.getQueryData<TimeEntry | null>(queryKeys.runningEntry)
      if (running?.id === id) {
        queryClient.setQueryData(queryKeys.runningEntry, input.stop ? null : { ...running, ...input })
      }
    },
  )
}

export function useDeleteEntry() {
  return useEntryMutation(timeEntriesApi.remove, (queryClient, id: string) => {
    updateWeeks(queryClient, (entries) => entries.filter((e) => e.id !== id))
    const running = queryClient.getQueryData<TimeEntry | null>(queryKeys.runningEntry)
    if (running?.id === id) queryClient.setQueryData(queryKeys.runningEntry, null)
  })
}

// Like Toggl, the original entry keeps the later part (and keeps running); a new entry takes the earlier part.
export function useSplitEntry() {
  return useEntryMutation(
    ({ entry, at }: { entry: TimeEntry; at: string }) => timeEntriesApi.split(entry.id, at),
    (queryClient, { entry, at }) => {
      const isOwn = queryClient
        .getQueriesData<TimeEntry[]>({ queryKey: queryKeys.weekEntries })
        .some(([, entries]) => entries?.some((e) => e.id === entry.id))
      updateWeeks(queryClient, (entries) => entries.map((e) => (e.id === entry.id ? { ...e, start: at } : e)))
      if (isOwn) insertIntoWeeks(queryClient, { ...entry, id: `${OPTIMISTIC_ID_PREFIX}${Date.now()}`, stop: at })
      const running = queryClient.getQueryData<TimeEntry | null>(queryKeys.runningEntry)
      if (running?.id === entry.id) queryClient.setQueryData(queryKeys.runningEntry, { ...running, start: at })
    },
  )
}

interface EntryUpdate {
  id: string
  input: TimeEntryInput
}

export function useUpdateEntries() {
  return useEntryMutation(
    async (updates: EntryUpdate[]) => {
      for (const { id, input } of updates) await timeEntriesApi.update(id, input)
    },
    (queryClient, updates) => {
      const inputs = new Map(updates.map(({ id, input }) => [id, input]))
      updateWeeks(queryClient, (entries) => entries.map((e) => (inputs.has(e.id) ? { ...e, ...inputs.get(e.id) } : e)))
    },
  )
}

export function useDeleteEntries() {
  return useEntryMutation(
    async (ids: string[]) => {
      for (const id of ids) await timeEntriesApi.remove(id)
    },
    (queryClient, ids) => {
      const removed = new Set(ids)
      updateWeeks(queryClient, (entries) => entries.filter((e) => !removed.has(e.id)))
    },
  )
}
