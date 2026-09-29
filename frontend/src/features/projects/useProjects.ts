import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { projectsApi } from '../../api/endpoints'
import { queryKeys } from '../../api/queryKeys'
import type { Project, ProjectInput } from '../../api/types'

export function useProjects() {
  return useQuery({ queryKey: queryKeys.projects, queryFn: projectsApi.list, staleTime: 5 * 60_000 })
}

export function useProjectLookup(): Map<string, Project> {
  const { data } = useProjects()
  return useMemo(() => new Map((data ?? []).map((project) => [project.id, project])), [data])
}

export function useSaveProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: ProjectInput }) =>
      id ? projectsApi.update(id, input) : projectsApi.create(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  })
}
