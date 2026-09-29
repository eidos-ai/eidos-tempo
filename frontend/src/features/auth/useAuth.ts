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

export function useSession() {
  return useQuery({ queryKey: queryKeys.me, queryFn: fetchCurrentUser, staleTime: Infinity })
}

export function useCurrentUser(): User {
  const { data } = useSession()
  if (!data) throw new Error('useCurrentUser must be used inside an authenticated route')
  return data
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      queryClient.clear()
      queryClient.setQueryData(queryKeys.me, null)
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
