import type { Grouping } from '../../api/types'
import { NO_PROJECT_COLOR } from '../../lib/colors'
import { useClientLookup } from '../clients/useClients'
import { useProjectLookup } from '../projects/useProjects'
import { useMemberLookup } from './useReports'

export interface GroupLabel {
  name: string
  hint: string | null
  color: string
  isEmpty: boolean
  isProject: boolean
}

export const GROUPING_NAMES: Record<Grouping, string> = {
  project: 'Projects',
  client: 'Clients',
  member: 'Members',
  description: 'Descriptions',
  billable: 'Billable',
}

export const GROUPING_SINGULAR: Record<Grouping, string> = {
  project: 'Project',
  client: 'Client',
  member: 'Member',
  description: 'Description',
  billable: 'Billable',
}

const EMPTY_LABELS: Record<Grouping, string> = {
  project: 'Without project',
  client: 'Without client',
  member: 'Unknown member',
  description: '(no description)',
  billable: 'Non-billable',
}

const SERIES_COUNT = 8
const UNASSIGNED = 'unassigned'
const BILLABLE_KEY = 'billable'

export function seriesColor(index: number): string {
  return `var(--color-series-${(index % SERIES_COUNT) + 1})`
}

export interface LabeledKey {
  key: string | null
  label: GroupLabel
}

export function withSeriesColors<T extends LabeledKey>(items: T[]): T[] {
  const byName = items
    .filter(({ label }) => label.color === UNASSIGNED)
    .map(({ key, label }) => [key, label.name] as const)
    .sort((a, b) => a[1].localeCompare(b[1]))
  const position = new Map(byName.map(([key], index) => [key, index]))
  return items.map((item) =>
    item.label.color === UNASSIGNED ? { ...item, label: { ...item.label, color: seriesColor(position.get(item.key) ?? 0) } } : item,
  )
}

export function useGroupLabeler(): (grouping: Grouping, key: string | null) => GroupLabel {
  const projects = useProjectLookup()
  const clients = useClientLookup()
  const members = useMemberLookup()

  return (grouping, key) => {
    const empty = { name: EMPTY_LABELS[grouping], hint: null, color: NO_PROJECT_COLOR, isEmpty: true, isProject: false }
    if (grouping === 'billable') {
      const isBillable = key === BILLABLE_KEY
      return {
        name: isBillable ? 'Billable' : 'Non-billable',
        hint: null,
        color: isBillable ? 'var(--color-chart-billable)' : 'var(--color-chart-non-billable)',
        isEmpty: false,
        isProject: false,
      }
    }
    if (!key) return empty
    if (grouping === 'project') {
      const project = projects.get(key)
      if (!project) return empty
      const client = project.client_id ? clients.get(project.client_id) : undefined
      return { name: project.name, hint: client?.name ?? null, color: project.color, isEmpty: false, isProject: true }
    }
    const name = grouping === 'client' ? clients.get(key)?.name : grouping === 'member' ? members.get(key)?.full_name : key
    return name === undefined ? empty : { name, hint: null, color: UNASSIGNED, isEmpty: false, isProject: false }
  }
}
