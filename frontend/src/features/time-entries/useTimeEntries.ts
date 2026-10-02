import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { timeEntriesApi } from '../../api/endpoints'
import { queryKeys } from '../../api/queryKeys'
import type { TimeEntry, TimeEntryInput, TimerStartInput } from '../../api/types'
import { addDays } from '../../lib/time'
import { showToast } from '../../lib/toast'

const OPTIMISTIC_ID_PREFIX = 'optimistic-'
const SYNC_INTERVAL_MS = 30_000
// Entry changes reach the server in the order the user made them (e.g. save description, then stop).
const ENTRY_MUTATION_SCOPE = { id: 'time-entries' }

type EntriesUpdater = (entries: TimeEntry[]) => TimeEntry[]

interface Snapshot {
  weeks: Array<[readonly unknown[], TimeEntry[] | undefined]>
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
    running: queryClient.getQueryData<TimeEntry | null>(queryKeys.runningEntry),
  }
}

function restore(queryClient: QueryClient, previous: Snapshot | undefined): void {
  if (!previous) return
  for (const [key, data] of previous.weeks) queryClient.setQueryData(key, data)
  queryClient.setQueryData(queryKeys.runningEntry, previous.running)
}

function updateWeeks(queryClient: QueryClient, updater: EntriesUpdater): void {
  queryClient.setQueriesData<TimeEntry[]>({ queryKey: queryKeys.weekEntries }, (entries) =>
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

function useEntryMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
  applyOptimistic: (queryClient: QueryClient, variables: TVariables) => void,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: queryKeys.timeEntries,
    scope: ENTRY_MUTATION_SCOPE,
    mutationFn,
    onMutate: async (variables: TVariables) => {
      const previous = await snapshot(queryClient)
      applyOptimistic(queryClient, variables)
      return previous
    },
    onError: (error, _variables, previous) => {
      restore(queryClient, previous)
      showToast(error.message)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries }),
  })
}

export function useStartTimer() {
  return useEntryMutation(timeEntriesApi.start, (queryClient, input: TimerStartInput) => {
    const now = new Date().toISOString()
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
}

export function useStopTimer() {
  return useEntryMutation(timeEntriesApi.stop, (queryClient) => {
    const running = queryClient.getQueryData<TimeEntry | null>(queryKeys.runningEntry)
    if (!running) return
    const now = new Date().toISOString()
    updateWeeks(queryClient, (entries) => entries.map((e) => (e.id === running.id ? { ...e, stop: now } : e)))
    queryClient.setQueryData(queryKeys.runningEntry, null)
  })
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
