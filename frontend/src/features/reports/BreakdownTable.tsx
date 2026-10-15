import { useState } from 'react'
import type { Grouping, SummaryGroup, SummaryReport } from '../../api/types'
import { ChevronDownIcon, ChevronRightIcon } from '../../components/icons'
import { projectTextColor } from '../../lib/colors'
import { formatDuration } from '../../lib/time'
import { Avatar } from './Avatar'
import { GROUPING_NAMES, GROUPING_SINGULAR, useGroupLabeler, type GroupLabel } from './groupLabels'
import { SelectMenu } from './SelectMenu'

type SortKey = 'name' | 'duration'
type SortDirection = 'asc' | 'desc'

interface BreakdownTableProps {
  report: SummaryReport
  onGroupingChange: (groupBy: Grouping, subgroupBy: Grouping) => void
}

const BREAKDOWN_OPTIONS = (['member', 'client', 'project', 'description'] as const).map((value) => ({
  value,
  label: GROUPING_NAMES[value],
}))

function percent(seconds: number, total: number): string {
  return total ? `${((seconds / total) * 100).toFixed(2)}%` : '0%'
}

export function BreakdownTable({ report, onGroupingChange }: BreakdownTableProps) {
  const labelOf = useGroupLabeler()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' })
  const total = report.total.seconds
  const { group_by: groupBy, subgroup_by: subgroupBy } = report
  const rowKey = (group: SummaryGroup) => group.key ?? 'none'

  const sorted = (groups: SummaryGroup[], grouping: Grouping) => {
    const sign = sort.direction === 'asc' ? 1 : -1
    return groups
      .map((group) => ({ group, label: labelOf(grouping, group.key) }))
      .sort((a, b) =>
        sort.key === 'duration'
          ? sign * (a.group.seconds - b.group.seconds)
          : sign * (Number(a.label.isEmpty) - Number(b.label.isEmpty) || a.label.name.localeCompare(b.label.name, undefined, { sensitivity: 'base' })),
      )
  }
  const allExpanded = report.groups.length > 0 && report.groups.every((group) => expanded.has(rowKey(group)))
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const sortBy = (key: SortKey) =>
    setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))

  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="text-sm font-semibold">
          {GROUPING_SINGULAR[groupBy]} and {GROUPING_SINGULAR[subgroupBy].toLowerCase()} breakdown
        </h2>
        <div className="flex items-center gap-2">
          <SelectMenu
            label="Breakdown by"
            value={groupBy}
            options={BREAKDOWN_OPTIONS}
            onChange={(next) => onGroupingChange(next, next === subgroupBy ? groupBy : subgroupBy)}
          />
          <SelectMenu
            label="and"
            value={subgroupBy}
            options={BREAKDOWN_OPTIONS}
            onChange={(next) => onGroupingChange(next === groupBy ? subgroupBy : groupBy, next)}
          />
        </div>
      </header>
      <div className="px-5 pb-4">
        <table className="w-full text-sm font-medium">
          <thead className="text-left text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
            <tr className="border-b border-line">
              <th className="w-12 py-3">
                <button
                  type="button"
                  aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
                  className="rounded p-1 text-ink-soft hover:bg-canvas hover:text-ink"
                  onClick={() => setExpanded(allExpanded ? new Set() : new Set(report.groups.map(rowKey)))}
                >
                  {allExpanded ? <ChevronDownIcon width={14} height={14} /> : <ChevronRightIcon width={14} height={14} />}
                </button>
              </th>
              <SortHeader
                label={`${GROUPING_SINGULAR[groupBy]} | ${GROUPING_SINGULAR[subgroupBy]}`}
                sort={sort.key === 'name' ? sort.direction : null}
                onClick={() => sortBy('name')}
                className="w-[22rem]"
              />
              <SortHeader label="Duration" sort={sort.key === 'duration' ? sort.direction : null} onClick={() => sortBy('duration')} className="w-36" />
              <SortHeader label="Duration %" sort={sort.key === 'duration' ? sort.direction : null} onClick={() => sortBy('duration')} />
            </tr>
          </thead>
          <tbody>
            {sorted(report.groups, groupBy).map(({ group, label }) => {
              const key = rowKey(group)
              const isOpen = expanded.has(key)
              return [
                <tr
                  key={key}
                  className={`h-11 cursor-pointer border-b border-line ${isOpen ? 'bg-canvas' : 'hover:bg-canvas/60'}`}
                  onClick={() => toggle(key)}
                >
                  <td>
                    <span className="inline-flex p-1 text-ink-soft">
                      {isOpen ? <ChevronDownIcon width={14} height={14} /> : <ChevronRightIcon width={14} height={14} />}
                    </span>
                  </td>
                  <td className="max-w-0 pr-4">
                    <GroupName grouping={groupBy} groupKey={group.key} label={label} count={group.subgroups.length} />
                  </td>
                  <td className="tabular-nums">{formatDuration(group.seconds)}</td>
                  <td className="tabular-nums">{percent(group.seconds, total)}</td>
                </tr>,
                ...(isOpen
                  ? sorted(group.subgroups, subgroupBy).map(({ group: subgroup, label: subLabel }) => (
                      <tr key={`${key}/${rowKey(subgroup)}`} className="h-11 border-b border-line bg-canvas/40">
                        <td />
                        <td className="max-w-0 pr-4 pl-6">
                          <GroupName grouping={subgroupBy} groupKey={subgroup.key} label={subLabel} />
                        </td>
                        <td className="tabular-nums">{formatDuration(subgroup.seconds)}</td>
                        <td className="tabular-nums">{percent(subgroup.seconds, total)}</td>
                      </tr>
                    ))
                  : []),
              ]
            })}
            {report.groups.length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-muted">
                  No time entries match these filters.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="h-11 font-semibold">
              <td />
              <td className="text-[11px] tracking-[0.04em] uppercase">Total</td>
              <td className="tabular-nums">{formatDuration(total)}</td>
              <td className="tabular-nums">{total ? '100%' : '0%'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function GroupName({ grouping, groupKey, label, count }: { grouping: Grouping; groupKey: string | null; label: GroupLabel; count?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {grouping === 'member' && groupKey ? (
        <Avatar name={label.name} />
      ) : (
        label.isProject && <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
      )}
      <span
        className={`truncate ${label.isEmpty ? 'text-muted' : ''}`}
        style={label.isProject ? { color: projectTextColor(label.color) } : undefined}
      >
        {label.name}
      </span>
      {label.hint && <span className="truncate text-muted">• {label.hint}</span>}
      {count !== undefined && <span className="text-muted">({count})</span>}
    </span>
  )
}

function SortHeader({ label, sort, onClick, className = '' }: { label: string; sort: SortDirection | null; onClick: () => void; className?: string }) {
  return (
    <th className={`py-3 pr-4 ${className}`}>
      <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 uppercase hover:text-ink ${sort ? 'text-ink-soft' : ''}`}>
        {label}
        <ChevronDownIcon width={12} height={12} className={sort === 'asc' ? '' : sort === 'desc' ? 'rotate-180' : 'opacity-60'} />
      </button>
    </th>
  )
}
