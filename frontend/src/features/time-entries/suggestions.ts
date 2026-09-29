import { useQuery } from '@tanstack/react-query'
import { timeEntriesApi } from '../../api/endpoints'
import { queryKeys } from '../../api/queryKeys'
import type { Client, EntrySuggestion, Project } from '../../api/types'

const MAX_VISIBLE_SUGGESTIONS = 8
const MAX_VISIBLE_PROJECTS = 5

export function useEntrySuggestions() {
  return useQuery({
    queryKey: queryKeys.entrySuggestions,
    queryFn: timeEntriesApi.suggestions,
    staleTime: 60_000,
  })
}

export function matchSuggestions(
  suggestions: EntrySuggestion[],
  query: string,
  projects: Map<string, Project>,
  clients: Map<string, Client>,
): EntrySuggestion[] {
  const term = query.trim().toLowerCase()
  if (!term) return suggestions.slice(0, MAX_VISIBLE_SUGGESTIONS)

  const rank = (suggestion: EntrySuggestion): number | null => {
    const description = suggestion.description.toLowerCase()
    if (description.startsWith(term)) return 0
    if (description.includes(term)) return 1
    const project = suggestion.project_id ? projects.get(suggestion.project_id) : undefined
    const client = project?.client_id ? clients.get(project.client_id) : undefined
    const context = `${project?.name ?? ''} ${client?.name ?? ''}`.toLowerCase()
    return context.includes(term) ? 2 : null
  }

  return suggestions
    .map((suggestion) => ({ suggestion, rank: rank(suggestion) }))
    .filter((match): match is { suggestion: EntrySuggestion; rank: number } => match.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_VISIBLE_SUGGESTIONS)
    .map((match) => match.suggestion)
}

export function matchProjects(projects: Project[], query: string, clients: Map<string, Client>): Project[] {
  const term = query.trim().toLowerCase()
  if (!term) return []
  return projects
    .filter((project) => !project.is_archived)
    .filter((project) => {
      const client = project.client_id ? clients.get(project.client_id) : undefined
      return `${project.name} ${client?.name ?? ''}`.toLowerCase().includes(term)
    })
    .slice(0, MAX_VISIBLE_PROJECTS)
}
