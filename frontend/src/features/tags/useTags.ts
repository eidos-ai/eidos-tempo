import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { tagsApi } from '../../api/endpoints'
import { queryKeys } from '../../api/queryKeys'
import type { Tag } from '../../api/types'

export function useTags() {
  return useQuery({ queryKey: queryKeys.tags, queryFn: tagsApi.list, staleTime: 5 * 60_000 })
}

export function useTagLookup(): Map<string, Tag> {
  const { data } = useTags()
  return useMemo(() => new Map((data ?? []).map((tag) => [tag.id, tag])), [data])
}

export function useCreateTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => tagsApi.create({ name, is_archived: false }),
    onSuccess: (tag) => queryClient.setQueryData<Tag[]>(queryKeys.tags, (tags) => [...(tags ?? []), tag]),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.tags }),
  })
}
