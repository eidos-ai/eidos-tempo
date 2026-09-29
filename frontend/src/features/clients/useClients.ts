import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { clientsApi } from '../../api/endpoints'
import { queryKeys } from '../../api/queryKeys'
import type { Client, ClientInput } from '../../api/types'

export function useClients() {
  return useQuery({ queryKey: queryKeys.clients, queryFn: clientsApi.list, staleTime: 5 * 60_000 })
}

export function useClientLookup(): Map<string, Client> {
  const { data } = useClients()
  return useMemo(() => new Map((data ?? []).map((client) => [client.id, client])), [data])
}

export function useSaveClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: ClientInput }) =>
      id ? clientsApi.update(id, input) : clientsApi.create(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.clients }),
  })
}
