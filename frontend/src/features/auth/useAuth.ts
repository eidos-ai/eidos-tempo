import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client'
import { authApi, meApi } from '../../api/endpoints'
import { queryKeys } from '../../api/queryKeys'
import type { Preferences, User } from '../../api/types'

async function fetchCurrentUser(): Promise<User | null> {
  try {
    return await meApi.get()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

const SESSION_RETRY_MS = 5000

export function useSession() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: fetchCurrentUser,
    staleTime: Infinity,
    refetchInterval: (query) => (query.state.status === 'error' ? SESSION_RETRY_MS : false),
  })
}

export { useCurrentUser } from './CurrentUserContext'

const REJECTED_SESSION_MESSAGE =
  "Your browser didn't keep the login session because this site isn't served over HTTPS. " +
  'Ask an admin to enable HTTPS (or set TEMPO_COOKIE_SECURE=false for plain-HTTP internal access).'

async function loginAndVerifySession(email: string, password: string): Promise<User> {
  await authApi.login(email, password)
  const user = await fetchCurrentUser()
  if (!user) throw new Error(REJECTED_SESSION_MESSAGE)
  return user
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      loginAndVerifySession(email, password),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      queryClient.setQueryData(queryKeys.me, null)
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.me[0] })
    },
  })
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: meApi.updatePreferences,
    scope: { id: 'preferences' },
    onMutate: (preferences: Preferences) => {
      const previous = queryClient.getQueryData<User | null>(queryKeys.me)
      if (previous) queryClient.setQueryData(queryKeys.me, { ...previous, preferences })
      return { previous }
    },
    onError: (_error, _preferences, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.me, context.previous)
    },
  })
}

export function usePreferenceSetter() {
  const queryClient = useQueryClient()
  const update = useUpdatePreferences()
  return <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    const user = queryClient.getQueryData<User | null>(queryKeys.me)
    if (user) update.mutate({ ...user.preferences, [key]: value })
  }
}
