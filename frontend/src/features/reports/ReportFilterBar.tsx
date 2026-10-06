import { useCallback, useMemo, useRef, useState, type ComponentType, type FormEvent, type ReactNode, type SVGProps } from 'react'
import {
  BriefcaseIcon,
  ChevronLeftIcon,
  CloseIcon,
  DollarIcon,
  FolderIcon,
  PlusIcon,
  SearchIcon,
  TagIcon,
  TextIcon,
  UsersIcon,
} from '../../components/icons'
import { projectTextColor } from '../../lib/colors'
import { useCurrentUser } from '../auth/useAuth'
import { useClients } from '../clients/useClients'
import { useProjects } from '../projects/useProjects'
import { useTags } from '../tags/useTags'
import { DateRangeControl } from './DateRangeControl'
import type { BillableChoice, ChoiceDimension, ChoiceFilter, Condition, ReportFilters } from './reportFilters'
import { useDismiss } from './useDismiss'
import { useMemberLookup } from './useReports'

type Icon = ComponentType<SVGProps<SVGSVGElement>>
type FilterKind = ChoiceDimension | 'billable' | 'description'

interface Option {
  id: string
  label: string
  hint?: string
  color?: string
  isArchived: boolean
}

interface ReportFilterBarProps {
  filters: ReportFilters
  onChange: (changes: Partial<ReportFilters>) => void
}

const FILTER_ORDER: FilterKind[] = ['members', 'clients', 'projects', 'tags', 'billable', 'description']
const QUICK_FILTERS: FilterKind[] = ['members', 'clients', 'projects', 'tags', 'description']

const FILTERS: Record<FilterKind, { label: string; icon: Icon }> = {
  members: { label: 'Member', icon: UsersIcon },
  clients: { label: 'Client', icon: BriefcaseIcon },
  projects: { label: 'Project', icon: FolderIcon },
  tags: { label: 'Tag', icon: TagIcon },
  billable: { label: 'Billable', icon: DollarIcon },
  description: { label: 'Description', icon: TextIcon },
}

const CONDITION_LABELS: Record<Condition, string> = {
  is: 'is',
  'is-not': 'is not',
  'is-empty': 'is empty',
  'is-not-empty': 'is not empty',
}

const EMPTY_FILTERS: Partial<ReportFilters> = {
  members: null,
  clients: null,
  projects: null,
  tags: null,
  billable: null,
  description: null,
}

function isActive(filters: ReportFilters, kind: FilterKind): boolean {
  return filters[kind] !== null
}

export function ReportFilterBar({ filters, onChange }: ReportFilterBarProps) {
  const isAdmin = useCurrentUser().role === 'admin'
  const [openKind, setOpenKind] = useState<FilterKind | null>(null)
  const options = useFilterOptions()
  const available = FILTER_ORDER.filter((kind) => kind !== 'members' || isAdmin)
  const chips = available.filter((kind) => isActive(filters, kind) || openKind === kind)
  const quick = QUICK_FILTERS.filter((kind) => available.includes(kind) && !chips.includes(kind))
  const hasActive = available.some((kind) => isActive(filters, kind))
  const close = useCallback(() => setOpenKind(null), [])
  const apply = (changes: Partial<ReportFilters>) => {
    onChange(changes)
    setOpenKind(null)
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-surface px-6 py-2.5">
      <DateRangeControl from={filters.from} to={filters.to} onChange={(from, to) => onChange({ from, to })} />
      {chips.map((kind) => (
        <FilterChip
          key={kind}
          kind={kind}
          filters={filters}
          options={options}
          isOpen={openKind === kind}
          onOpen={() => setOpenKind(kind)}
          onClose={close}
          onApply={apply}
        />
      ))}
      {quick.map((kind) => (
        <QuickFilterButton key={kind} kind={kind} onClick={() => setOpenKind(kind)} />
      ))}
      <AddFilterMenu kinds={available.filter((kind) => !isActive(filters, kind))} onPick={setOpenKind} />
      {hasActive && (
        <button
          type="button"
          aria-label="Clear all filters"
          title="Clear all filters"
          className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          <CloseIcon width={16} height={16} />
        </button>
      )}
    </div>
  )
}

function QuickFilterButton({ kind, onClick }: { kind: FilterKind; onClick: () => void }) {
  const { label, icon: ItemIcon } = FILTERS[kind]
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-ink hover:bg-canvas"
    >
      <ItemIcon width={16} height={16} className="text-ink-soft" />
      {label}
    </button>
  )
}

function AddFilterMenu({ kinds, onPick }: { kinds: FilterKind[]; onPick: (kind: FilterKind) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(containerRef, isOpen, close)
  const visible = kinds.filter((kind) => FILTERS[kind].label.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={kinds.length === 0}
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-ink hover:bg-canvas disabled:opacity-40"
      >
        <PlusIcon width={16} height={16} /> Add filter
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 z-40 mt-2 w-56 rounded-lg border border-line bg-surface p-2 shadow-xl">
          <SearchField value={search} onChange={setSearch} placeholder="Find filter..." />
          {visible.map((kind) => {
            const { label, icon: ItemIcon } = FILTERS[kind]
            return (
              <button
                key={kind}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-canvas"
                onClick={() => {
                  setIsOpen(false)
                  onPick(kind)
                }}
              >
                <ItemIcon width={16} height={16} className="text-ink-soft" />
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface FilterChipProps {
  kind: FilterKind
  filters: ReportFilters
  options: Record<ChoiceDimension, Option[]>
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  onApply: (changes: Partial<ReportFilters>) => void
}

function FilterChip({ kind, filters, options, isOpen, onOpen, onClose, onApply }: FilterChipProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useDismiss(containerRef, isOpen, onClose)
  const { label, icon: ItemIcon } = FILTERS[kind]
  const name = kind === 'billable' ? 'Entry' : label
  const summary = chipSummary(kind, filters, options)

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex h-9 max-w-80 items-center rounded-lg text-sm ${isOpen ? 'bg-primary-soft text-accent' : 'bg-canvas text-ink'}`}>
        <button type="button" onClick={isOpen ? onClose : onOpen} className="flex min-w-0 items-center gap-2 py-2 pl-3">
          <ItemIcon width={16} height={16} className="shrink-0" />
          <span className="truncate">
            <span className="font-semibold">{name}</span>
            {summary ? (
              <>
                {' '}
                {summary.condition} <span className="font-semibold">{summary.value}</span>
              </>
            ) : (
              ' is...'
            )}
          </span>
        </button>
        <button
          type="button"
          aria-label={`Remove ${label.toLowerCase()} filter`}
          className="flex h-full items-center px-2.5 hover:text-ink"
          onClick={() => onApply({ [kind]: null })}
        >
          <CloseIcon width={14} height={14} />
        </button>
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 z-40 mt-2 w-80 rounded-lg border border-line bg-surface shadow-xl">
          <button type="button" onClick={onClose} className="flex items-center gap-2 px-4 pt-4 pb-2 text-sm font-semibold">
            <ChevronLeftIcon width={14} height={14} /> {name}
          </button>
          {kind === 'billable' ? (
            <BillablePanel value={filters.billable} onApply={(billable) => onApply({ billable })} />
          ) : kind === 'description' ? (
            <DescriptionPanel value={filters.description} onApply={(description) => onApply({ description })} />
          ) : (
            <ChoicePanel kind={kind} value={filters[kind]} options={options[kind]} onApply={(choice) => onApply({ [kind]: choice })} />
          )}
        </div>
      )}
    </div>
  )
}

function chipSummary(
  kind: FilterKind,
  filters: ReportFilters,
  options: Record<ChoiceDimension, Option[]>,
): { condition: string; value: string } | null {
  if (kind === 'billable') return filters.billable ? { condition: 'is', value: filters.billable } : null
  if (kind === 'description') {
    return filters.description !== null ? { condition: 'contains', value: `"${filters.description}"` } : null
  }
  const choice = filters[kind]
  if (!choice) return null
  if (choice.condition === 'is-empty' || choice.condition === 'is-not-empty') {
    return { condition: CONDITION_LABELS[choice.condition], value: '' }
  }
  const names = new Map(options[kind].map((option) => [option.id, option.label.replace(/ \(You\)$/, '')]))
  return {
    condition: CONDITION_LABELS[choice.condition],
    value: choice.ids.map((id) => names.get(id) ?? 'Unknown').join(', '),
  }
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">{children}</p>
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="mb-1 flex items-center gap-2 rounded-md border border-line-strong px-2 text-muted focus-within:border-primary">
      <SearchIcon width={14} height={14} />
      <input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 flex-1 bg-transparent text-sm text-ink outline-none"
      />
    </div>
  )
}

function ApplyButton({ disabled, isNew }: { disabled: boolean; isNew: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="h-9 w-full rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-strong disabled:opacity-40"
    >
      {isNew ? 'Add' : 'Apply'}
    </button>
  )
}

interface ChoicePanelProps {
  kind: ChoiceDimension
  value: ChoiceFilter | null
  options: Option[]
  onApply: (choice: ChoiceFilter) => void
}

function ChoicePanel({ kind, value, options, onApply }: ChoicePanelProps) {
  const [condition, setCondition] = useState<Condition>(value?.condition ?? 'is')
  const [selected, setSelected] = useState<string[]>(value?.ids ?? [])
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const conditions: Condition[] = kind === 'members' ? ['is', 'is-not'] : ['is', 'is-not', 'is-empty', 'is-not-empty']
  const needsIds = condition === 'is' || condition === 'is-not'
  const term = search.trim().toLowerCase()
  const visible = options
    .filter((option) => showArchived || !option.isArchived || selected.includes(option.id))
    .filter((option) => `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(term))
  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onApply({ condition, ids: needsIds ? selected : [] })
  }

  return (
    <form onSubmit={submit} className="px-4 pb-4">
      <SectionLabel>Condition</SectionLabel>
      <select
        aria-label="Condition"
        value={condition}
        onChange={(event) => setCondition(event.target.value as Condition)}
        className="mb-3 h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm font-medium outline-none focus:border-primary"
      >
        {conditions.map((option) => (
          <option key={option} value={option}>
            {CONDITION_LABELS[option]}
          </option>
        ))}
      </select>
      {needsIds && (
        <>
          <SearchField value={search} onChange={setSearch} placeholder={`Find ${FILTERS[kind].label.toLowerCase()}...`} />
          <div className="mt-2 mb-1 flex items-center justify-between">
            <SectionLabel>{FILTERS[kind].label}s</SectionLabel>
            <span className="flex gap-2 text-[11px] font-semibold uppercase">
              <button type="button" className="text-accent hover:underline" onClick={() => setSelected(visible.map((option) => option.id))}>
                All
              </button>
              <button type="button" className="text-accent hover:underline" onClick={() => setSelected([])}>
                None
              </button>
            </span>
          </div>
          <div className="-mx-1 max-h-60 overflow-y-auto">
            {visible.map((option) => (
              <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-canvas">
                <input
                  type="checkbox"
                  checked={selected.includes(option.id)}
                  onChange={() => toggle(option.id)}
                  className="size-4 shrink-0 accent-primary"
                />
                {option.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />}
                <span
                  className={`truncate font-medium ${option.isArchived ? 'opacity-60' : ''}`}
                  style={option.color ? { color: projectTextColor(option.color) } : undefined}
                >
                  {option.label}
                </span>
                {option.hint && <span className="truncate text-muted">• {option.hint}</span>}
              </label>
            ))}
            {visible.length === 0 && <p className="py-3 text-center text-sm text-muted">Nothing found</p>}
          </div>
          <div className="my-2 flex items-center justify-between border-t border-line pt-2 text-sm">
            <SectionLabel>Show</SectionLabel>
            <button type="button" className="font-medium hover:text-accent" onClick={() => setShowArchived((shown) => !shown)}>
              {showArchived ? 'All' : 'Active'}
            </button>
          </div>
        </>
      )}
      <ApplyButton disabled={needsIds && selected.length === 0} isNew={value === null} />
    </form>
  )
}

function BillablePanel({ value, onApply }: { value: BillableChoice | null; onApply: (value: BillableChoice) => void }) {
  return (
    <div className="px-2 pb-2">
      {(['billable', 'non-billable'] as const).map((choice) => (
        <button
          key={choice}
          type="button"
          onClick={() => onApply(choice)}
          className={`w-full rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-canvas ${value === choice ? 'text-accent' : ''}`}
        >
          is {choice}
        </button>
      ))}
    </div>
  )
}

function DescriptionPanel({ value, onApply }: { value: string | null; onApply: (value: string) => void }) {
  const [text, setText] = useState(value ?? '')
  return (
    <form
      className="px-4 pb-4"
      onSubmit={(event) => {
        event.preventDefault()
        onApply(text.trim())
      }}
    >
      <SectionLabel>Condition</SectionLabel>
      <select aria-label="Condition" disabled className="mb-3 h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm font-medium">
        <option>contains</option>
      </select>
      <SectionLabel>Match criteria</SectionLabel>
      <input
        autoFocus
        aria-label="Description contains"
        value={text}
        maxLength={500}
        onChange={(event) => setText(event.target.value)}
        className="mb-3 h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm outline-none focus:border-primary"
      />
      <ApplyButton disabled={text.trim() === ''} isNew={value === null} />
    </form>
  )
}

function useFilterOptions(): Record<ChoiceDimension, Option[]> {
  const currentUserId = useCurrentUser().id
  const members = useMemberLookup()
  const { data: clients = [] } = useClients()
  const { data: projects = [] } = useProjects()
  const { data: tags = [] } = useTags()

  return useMemo(() => {
    const clientNames = new Map(clients.map((client) => [client.id, client.name]))
    const byLabel = (a: Option, b: Option) => a.label.localeCompare(b.label)
    const you = (option: Option) => Number(option.id === currentUserId)
    return {
      members: [...members.values()]
        .map((user) => ({
          id: user.id,
          label: user.id === currentUserId ? `${user.full_name} (You)` : user.full_name,
          isArchived: !user.is_active,
        }))
        .sort((a, b) => you(b) - you(a) || byLabel(a, b)),
      clients: clients.map((client) => ({ id: client.id, label: client.name, isArchived: client.is_archived })).sort(byLabel),
      projects: projects
        .map((project) => ({
          id: project.id,
          label: project.name,
          hint: project.client_id ? clientNames.get(project.client_id) : undefined,
          color: project.color,
          isArchived: project.is_archived,
        }))
        .sort(byLabel),
      tags: tags.map((tag) => ({ id: tag.id, label: tag.name, isArchived: tag.is_archived })).sort(byLabel),
    }
  }, [members, clients, projects, tags, currentUserId])
}
