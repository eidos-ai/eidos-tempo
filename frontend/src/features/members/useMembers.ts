import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '../../api/endpoints'
import { queryKeys } from '../../api/queryKeys'
import type { UserCreateInput, UserUpdateInput } from '../../api/types'

export function useMembers(enabled = true) {
  return useQuery({ queryKey: queryKeys.users, queryFn: usersApi.list, enabled })
}

export function useCreateMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UserCreateInput) => usersApi.create(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  })
}

export function useUpdateMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UserUpdateInput }) => usersApi.update(id, input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  })
}

export function useResetMemberPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => usersApi.resetPassword(id, password),
  })
}
