import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ReportEntry, Tag, TimeEntryInput } from '../../api/types'
import { Button } from '../../components/Button'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, DollarIcon, FolderIcon, MoreIcon, PencilIcon, TagIcon, TrashIcon } from '../../components/icons'
import { Modal } from '../../components/Modal'
import { entrySeconds, formatClockTime, formatDuration, parseDuration } from '../../lib/time'
import { useCurrentUser } from '../auth/useAuth'
import { ProjectLabel } from '../projects/ProjectLabel'
import { ProjectPicker } from '../projects/ProjectPicker'
import { useProjectLookup } from '../projects/useProjects'
import { TagList, TagPicker } from '../tags/TagPicker'
import { canSplit } from '../time-entries/split'
import { SplitDialog } from '../time-entries/SplitDialog'
import { useCreateEntry, useDeleteEntries, useDeleteEntry, useUpdateEntries, useUpdateEntry } from '../time-entries/useTimeEntries'
import { MAX_DESCRIPTION_LENGTH } from '../timer/TimerBar'
import { Avatar } from './Avatar'
import { MonthCalendar } from './MonthCalendar'
import { TimeDateEditor } from './TimeDateEditor'
import { useDismiss } from './useDismiss'
import { useMemberLookup } from './useReports'

const PAGE_SIZE = 100

type SortKey = 'description' | 'billable' | 'duration' | 'member' | 'project' | 'tags' | 'time'
type Changes = Partial<TimeEntryInput>

function inputFor(entry: ReportEntry, changes: Changes): TimeEntryInput {
  return {
    description: entry.description,
    project_id: entry.project_id,
    is_billable: entry.is_billable,
    tag_ids: entry.tag_ids,
    start: entry.start,
    stop: entry.stop,
    ...changes,
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function durationOf(entry: ReportEntry): number {
  return entrySeconds(entry, new Date(entry.stop ?? entry.start))
}

function moveToDay(entry: ReportEntry, day: Date): Changes {
  const start = new Date(entry.start)
  const moved = new Date(day.getFullYear(), day.getMonth(), day.getDate(), start.getHours(), start.getMinutes(), start.getSeconds())
  return { start: moved.toISOString(), stop: new Date(moved.getTime() + durationOf(entry) * 1000).toISOString() }
}

interface DetailedTableProps {
  title: string
  entries: ReportEntry[]
  isLoading: boolean
}

export function DetailedTable({ title, entries, isLoading }: DetailedTableProps) {
  const members = useMemberLookup()
  const projects = useProjectLookup()
  const updateEntries = useUpdateEntries()
  const deleteEntries = useDeleteEntries()
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkEditing, setIsBulkEditing] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: 'time', ascending: false })

  const sortValue = (entry: ReportEntry): string | number => {
    if (sort.key === 'description') return entry.description.toLowerCase()
    if (sort.key === 'billable') return Number(entry.is_billable)
    if (sort.key === 'duration') return durationOf(entry)
    if (sort.key === 'member') return members.get(entry.user_id)?.full_name.toLowerCase() ?? ''
    if (sort.key === 'project') return (entry.project_id && projects.get(entry.project_id)?.name.toLowerCase()) || '￿'
    if (sort.key === 'tags') return entry.tag_ids.length
    return new Date(entry.start).getTime()
  }
  const sorted = [...entries].sort((a, b) => {
    const [left, right] = [sortValue(a), sortValue(b)]
    const order = left < right ? -1 : left > right ? 1 : 0
    return sort.ascending ? order : -order
  })
  const visible = sorted.slice(0, visibleCount)
  const selected = entries.filter((entry) => selectedIds.has(entry.id))
  const allSelected = visible.length > 0 && visible.every((entry) => selectedIds.has(entry.id))
  const sortBy = (key: SortKey) => setSort((current) => ({ key, ascending: current.key === key ? !current.ascending : true }))
  const toggleSelected = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const deleteSelected = () => {
    if (!window.confirm(`Delete ${selected.length} time ${selected.length === 1 ? 'entry' : 'entries'}?`)) return
    deleteEntries.mutate(selected.map((entry) => entry.id))
    setSelectedIds(new Set())
  }

  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="flex h-14 items-center gap-2 px-5">
        {selected.length > 0 ? (
          <>
            <span className="mr-3 text-sm font-semibold">
              {selected.length} {selected.length === 1 ? 'item' : 'items'} selected
            </span>
            <HeaderButton onClick={() => setIsBulkEditing(true)}>
              <PencilIcon width={15} height={15} /> Edit
            </HeaderButton>
            <HeaderButton onClick={deleteSelected}>
              <TrashIcon width={15} height={15} /> Delete
            </HeaderButton>
            <button
              type="button"
              aria-label="Clear selection"
              className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink"
              onClick={() => setSelectedIds(new Set())}
            >
              <CloseIcon width={15} height={15} />
            </button>
          </>
        ) : (
          <h2 className="text-sm font-semibold">{title}</h2>
        )}
      </header>
      <div className="px-5 pb-2">
        <table className="w-full table-fixed text-sm font-medium">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-12" />
            <col className="w-28" />
            <col className="w-40" />
            <col className="w-52" />
            <col className="w-36" />
            <col className="w-48" />
            <col className="w-12" />
          </colgroup>
          <thead className="text-left text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
            <tr className="border-b border-line">
              <th className="py-3 pl-1">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  className="size-4 accent-primary"
                  checked={allSelected}
                  onChange={() => setSelectedIds(allSelected ? new Set() : new Set(visible.map((entry) => entry.id)))}
                />
              </th>
              <SortHeader label="Description" sortKey="description" sort={sort} onSort={sortBy} />
              <SortHeader label="$" sortKey="billable" sort={sort} onSort={sortBy} />
              <SortHeader label="Duration" sortKey="duration" sort={sort} onSort={sortBy} />
              <SortHeader label="Member" sortKey="member" sort={sort} onSort={sortBy} />
              <SortHeader label="Project" sortKey="project" sort={sort} onSort={sortBy} />
              <SortHeader label="Tags" sortKey="tags" sort={sort} onSort={sortBy} />
              <SortHeader label="Time | Date" sortKey="time" sort={sort} onSort={sortBy} />
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                memberName={members.get(entry.user_id)?.full_name ?? 'Unknown member'}
                isSelected={selectedIds.has(entry.id)}
                onToggleSelected={() => toggleSelected(entry.id)}
              />
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-muted">
                  {isLoading ? 'Loading…' : 'No time entries match these filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {entries.length > visibleCount && (
        <div className="border-t border-line p-3 text-center">
          <Button variant="ghost" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
            Load more ({entries.length - visibleCount} left)
          </Button>
        </div>
      )}
      {isBulkEditing && (
        <BulkEditModal
          entries={selected}
          onClose={() => setIsBulkEditing(false)}
          onApply={(changes) => {
            updateEntries.mutate(selected.map((entry) => ({ id: entry.id, input: inputFor(entry, changes(entry)) })))
            setIsBulkEditing(false)
            setSelectedIds(new Set())
          }}
        />
      )}
    </section>
  )
}

function HeaderButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold hover:bg-canvas">
      {children}
    </button>
  )
}

interface SortHeaderProps {
  label: string
  sortKey: SortKey
  sort: { key: SortKey; ascending: boolean }
  onSort: (key: SortKey) => void
}

function SortHeader({ label, sortKey, sort, onSort }: SortHeaderProps) {
  const isActive = sort.key === sortKey
  return (
    <th className="py-3 pr-3" aria-sort={isActive ? (sort.ascending ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase hover:text-ink ${isActive ? 'text-ink-soft' : ''}`}
      >
        {label}
        <ChevronDownIcon width={12} height={12} className={isActive && sort.ascending ? 'rotate-180' : isActive ? '' : 'opacity-60'} />
      </button>
    </th>
  )
}

interface EntryRowProps {
  entry: ReportEntry
  memberName: string
  isSelected: boolean
  onToggleSelected: () => void
}

function EntryRow({ entry, memberName, isSelected, onToggleSelected }: EntryRowProps) {
  const projects = useProjectLookup()
  const updateEntry = useUpdateEntry()
  const deleteEntry = useDeleteEntry()
  const [isEditingTime, setIsEditingTime] = useState(false)
  const [isSplitting, setIsSplitting] = useState(false)
  // Reports leave out running entries, so the stop is always known.
  const isSplittable = canSplit(entry, new Date(entry.stop ?? entry.start))
  const start = new Date(entry.start)
  const stop = new Date(entry.stop ?? entry.start)
  const latest = useRef(entry)
  useEffect(() => {
    latest.current = entry
  }, [entry])
  const update = (changes: Changes) => {
    const input = inputFor(latest.current, changes)
    latest.current = { ...latest.current, ...input }
    updateEntry.mutate({ id: entry.id, input })
  }
  const toggleBillable = () => update({ is_billable: !latest.current.is_billable })
  const remove = () => {
    if (window.confirm('Delete this time entry?')) deleteEntry.mutate(entry.id)
  }
  const closeTimeEditor = useCallback(() => setIsEditingTime(false), [])
  const [draftTagIds, setDraftTagIds] = useState<string[] | null>(null)
  const saveTags = () => {
    const changed = draftTagIds !== null && [...draftTagIds].sort().join() !== [...entry.tag_ids].sort().join()
    if (changed) update({ tag_ids: draftTagIds })
    setDraftTagIds(null)
  }

  return (
    <tr className={`group h-[59px] border-b border-line last:border-b-0 ${isSelected ? 'bg-primary-soft/50' : 'hover:bg-canvas/70'}`}>
      <td className="pl-1">
        <input
          type="checkbox"
          aria-label="Select entry"
          className={`size-4 accent-primary ${isSelected ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
          checked={isSelected}
          onChange={onToggleSelected}
        />
      </td>
      <td className="pr-3">
        <InlineText
          value={entry.description}
          placeholder="Add description"
          ariaLabel="Description"
          maxLength={MAX_DESCRIPTION_LENGTH}
          onSave={(description) => update({ description })}
        />
      </td>
      <td>
        <button
          type="button"
          aria-pressed={entry.is_billable}
          aria-label="Billable"
          title={entry.is_billable ? 'Billable (click to make non-billable)' : 'Non-billable (click to make billable)'}
          onClick={toggleBillable}
          className={`rounded-md p-1.5 ${
            entry.is_billable ? 'text-primary hover:bg-canvas' : 'text-muted opacity-0 group-hover:opacity-100 hover:text-primary focus:opacity-100'
          }`}
        >
          <DollarIcon width={16} height={16} />
        </button>
      </td>
      <td className="pr-3">
        <InlineText
          value={formatDuration(durationOf(entry))}
          ariaLabel="Duration"
          className="tabular-nums"
          validate={(text) => (parseDuration(text) === null ? 'Use h:mm:ss' : null)}
          onSave={(text) => {
            const duration = parseDuration(text)
            if (duration !== null) update({ stop: new Date(new Date(latest.current.start).getTime() + duration * 1000).toISOString() })
          }}
        />
      </td>
      <td className="pr-3">
        <span className="flex min-w-0 items-center gap-2 text-ink-soft">
          <Avatar name={memberName} />
          <span className="truncate">{memberName}</span>
        </span>
      </td>
      <td className="max-w-0 pr-3">
        <ProjectPicker
          value={entry.project_id}
          onChange={(projectId) =>
            update({ project_id: projectId, is_billable: projectId ? (projects.get(projectId)?.is_billable ?? false) : false })
          }
          renderTrigger={(project) => (
            <span className="flex max-w-full items-center rounded-md px-1.5 py-1 hover:bg-canvas">
              {project ? (
                <ProjectLabel project={project} />
              ) : (
                <span className="flex items-center gap-1.5 text-muted opacity-0 group-hover:opacity-100">
                  <FolderIcon width={15} height={15} /> Project
                </span>
              )}
            </span>
          )}
        />
      </td>
      <td className="pr-3">
        <TagPicker
          value={draftTagIds ?? entry.tag_ids}
          onChange={setDraftTagIds}
          onClose={saveTags}
          renderTrigger={(tags: Tag[]) =>
            tags.length > 0 ? (
              <span className="rounded-md px-1 py-1 hover:bg-canvas">
                <TagList tags={tags} />
              </span>
            ) : (
              <span className="rounded-md p-1.5 text-muted opacity-0 group-hover:opacity-100 hover:text-primary" title="Add tags">
                <TagIcon width={16} height={16} />
              </span>
            )
          }
        />
      </td>
      <td className="relative">
        <button
          type="button"
          aria-label="Edit start and stop"
          className={`rounded-md px-2 py-1 text-left whitespace-nowrap hover:bg-canvas ${isEditingTime ? 'bg-canvas' : ''}`}
          onClick={() => setIsEditingTime((open) => !open)}
        >
          <span className="block text-ink-soft tabular-nums">
            {formatClockTime(start)} - {formatClockTime(stop)}
          </span>
          <span className="block tabular-nums">{formatDate(start)}</span>
        </button>
        {isEditingTime && (
          <TimeDateEditor
            entry={entry}
            onSave={(newStart, newStop) => update({ start: newStart.toISOString(), stop: newStop.toISOString() })}
            onClose={closeTimeEditor}
          />
        )}
      </td>
      <td>
        <RowMenu
          entry={entry}
          onToggleBillable={toggleBillable}
          onSplit={isSplittable ? () => setIsSplitting(true) : null}
          onDelete={remove}
        />
        {isSplitting && <SplitDialog entry={entry} onClose={() => setIsSplitting(false)} />}
      </td>
    </tr>
  )
}

interface InlineTextProps {
  value: string
  onSave: (value: string) => void
  ariaLabel: string
  placeholder?: string
  maxLength?: number
  className?: string
  validate?: (value: string) => string | null
}

function InlineText({ value, onSave, ariaLabel, placeholder, maxLength, className = '', validate }: InlineTextProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const error = draft !== null && validate ? validate(draft) : null
  const finish = () => {
    if (draft !== null && draft.trim() !== value && !error) onSave(draft.trim())
    setDraft(null)
  }

  if (draft === null) {
    return (
      <button
        type="button"
        aria-label={`Edit ${ariaLabel.toLowerCase()}`}
        onClick={() => setDraft(value)}
        className={`block w-full truncate rounded-md border border-transparent px-2 py-1.5 text-left hover:border-line-strong ${value ? '' : 'text-muted'} ${className}`}
      >
        {value || placeholder}
      </button>
    )
  }
  return (
    <input
      autoFocus
      aria-label={ariaLabel}
      aria-invalid={error !== null}
      title={error ?? undefined}
      value={draft}
      maxLength={maxLength}
      placeholder={placeholder}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') setDraft(null)
      }}
      className={`h-[34px] w-full rounded-md border bg-canvas px-2 outline-none ${error ? 'border-danger' : 'border-primary'} ${className}`}
    />
  )
}

interface RowMenuProps {
  entry: ReportEntry
  onToggleBillable: () => void
  onSplit: (() => void) | null
  onDelete: () => void
}

function RowMenu({ entry, onToggleBillable, onSplit, onDelete }: RowMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(containerRef, isOpen, close)
  const navigate = useNavigate()
  const isOwn = useCurrentUser().id === entry.user_id
  const createEntry = useCreateEntry()
  const act = (action: () => void) => () => {
    setIsOpen(false)
    action()
  }
  const duplicate = () =>
    createEntry.mutate({
      description: entry.description,
      project_id: entry.project_id,
      is_billable: entry.is_billable,
      tag_ids: entry.tag_ids,
      start: entry.start,
      stop: entry.stop,
    })

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={`rounded-md p-1.5 text-ink-soft hover:bg-canvas hover:text-ink ${isOpen ? 'bg-canvas' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
      >
        <MoreIcon width={16} height={16} />
      </button>
      {isOpen && (
        <div className="absolute top-full right-0 z-40 mt-1 w-44 rounded-lg border border-line bg-surface p-1 shadow-xl">
          {isOwn && <MenuItem onClick={act(duplicate)}>Duplicate</MenuItem>}
          <MenuItem onClick={act(onToggleBillable)}>{entry.is_billable ? 'Set as non-billable' : 'Set as billable'}</MenuItem>
          <MenuItem onClick={act(() => onSplit?.())} disabled={!onSplit} hint={onSplit ? undefined : 'Too short to split'}>
            Split
          </MenuItem>
          {entry.project_id && <MenuItem onClick={act(() => navigate('/projects'))}>Go to project</MenuItem>}
          <MenuItem onClick={act(onDelete)} danger>
            Delete
          </MenuItem>
        </div>
      )}
    </div>
  )
}

interface MenuItemProps {
  onClick: () => void
  children: ReactNode
  danger?: boolean
  disabled?: boolean
  hint?: string
}

function MenuItem({ onClick, children, danger = false, disabled = false, hint }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={`block w-full rounded-md px-3 py-1.5 text-left text-sm font-medium hover:bg-canvas disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent ${danger ? 'text-danger' : ''}`}
    >
      {children}
    </button>
  )
}

type BillableChange = 'keep' | 'billable' | 'non-billable'

interface BulkEditModalProps {
  entries: ReportEntry[]
  onClose: () => void
  onApply: (changes: (entry: ReportEntry) => Changes) => void
}

function FieldTrigger({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-10 w-full min-w-0 items-center justify-between gap-2 px-3 text-sm">
      {children}
      <ChevronDownIcon width={14} height={14} className="shrink-0 text-muted" />
    </span>
  )
}

function commonValue<T>(values: T[]): T | undefined {
  return values.every((value) => value === values[0]) ? values[0] : undefined
}

function BulkEditModal({ entries, onClose, onApply }: BulkEditModalProps) {
  const sharedDescription = commonValue(entries.map((entry) => entry.description))
  const sharedProject = commonValue(entries.map((entry) => entry.project_id))
  const [description, setDescription] = useState(sharedDescription ?? '')
  const [projectId, setProjectId] = useState<string | null | undefined>(sharedProject)
  const [addedTagIds, setAddedTagIds] = useState<string[]>([])
  const [removeExistingTags, setRemoveExistingTags] = useState(false)
  const [day, setDay] = useState<Date | null>(null)
  const [isPickingDay, setIsPickingDay] = useState(false)
  const [month, setMonth] = useState(() => {
    const first = new Date(entries[0]?.start ?? Date.now())
    return new Date(first.getFullYear(), first.getMonth(), 1)
  })
  const [billable, setBillable] = useState<BillableChange>('keep')
  const projectChanged = projectId !== sharedProject
  const descriptionChanged = description.trim() !== '' && description.trim() !== (sharedDescription ?? '')
  const hasChanges =
    descriptionChanged || projectChanged || addedTagIds.length > 0 || removeExistingTags || day !== null || billable !== 'keep'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onApply((entry) => ({
      ...(descriptionChanged ? { description: description.trim() } : {}),
      ...(projectChanged && projectId !== undefined ? { project_id: projectId } : {}),
      ...(addedTagIds.length > 0 || removeExistingTags
        ? { tag_ids: [...new Set([...(removeExistingTags ? [] : entry.tag_ids), ...addedTagIds])] }
        : {}),
      ...(day ? moveToDay(entry, day) : {}),
      ...(billable === 'keep' ? {} : { is_billable: billable === 'billable' }),
    }))
  }

  return (
    <Modal title={`Bulk edit ${entries.length} time ${entries.length === 1 ? 'entry' : 'entries'}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input
          aria-label="Description"
          value={description}
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder={sharedDescription === undefined ? 'Multiple descriptions (unchanged)' : 'Description'}
          onChange={(event) => setDescription(event.target.value)}
          className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none focus:border-primary"
        />
        <div className="rounded-lg border border-line-strong">
          <ProjectPicker
            value={projectId ?? null}
            onChange={setProjectId}
            fullWidth
            renderTrigger={(project) => (
              <FieldTrigger>
                {projectId === undefined ? (
                  <span className="text-muted">Multiple projects (unchanged)</span>
                ) : (
                  <ProjectLabel project={project} />
                )}
              </FieldTrigger>
            )}
          />
        </div>
        <div className="rounded-lg border border-line-strong">
          <TagPicker
            value={addedTagIds}
            onChange={setAddedTagIds}
            fullWidth
            renderTrigger={(tags) => (
              <FieldTrigger>{tags.length > 0 ? <TagList tags={tags} /> : <span className="text-muted">Add tags</span>}</FieldTrigger>
            )}
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={removeExistingTags}
            onChange={(event) => setRemoveExistingTags(event.target.checked)}
          />
          Remove existing tags
        </label>
        <div className="relative">
          <button
            type="button"
            aria-label="Date"
            onClick={() => setIsPickingDay((open) => !open)}
            className="flex h-10 w-full items-center justify-between rounded-lg border border-line-strong px-3 text-sm"
          >
            <span className={day ? '' : 'text-muted'}>{day ? formatDate(day) : 'Dates (unchanged)'}</span>
            <ChevronDownIcon width={14} height={14} className="text-muted" />
          </button>
          {isPickingDay && (
            <div className="absolute top-full left-0 z-10 mt-1 rounded-lg border border-line bg-surface p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                <button type="button" aria-label="Previous month" className="rounded p-1 hover:bg-canvas" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                  <ChevronLeftIcon width={14} height={14} />
                </button>
                {month.toLocaleDateString([], { month: 'long', year: 'numeric' })}
                <button type="button" aria-label="Next month" className="rounded p-1 hover:bg-canvas" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                  <ChevronRightIcon width={14} height={14} />
                </button>
              </div>
              <MonthCalendar
                month={month}
                rangeStart={day}
                rangeEnd={day}
                showWeekNumbers={false}
                onPick={(picked) => {
                  setDay(picked)
                  setIsPickingDay(false)
                }}
              />
            </div>
          )}
        </div>
        <div className="flex h-10 items-center justify-between rounded-lg border border-line-strong px-3 text-sm">
          Billable
          <span className="flex overflow-hidden rounded-md border border-line-strong">
            {(['keep', 'billable', 'non-billable'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={billable === choice}
                onClick={() => setBillable(choice)}
                className={`px-2.5 py-1 text-xs font-semibold ${billable === choice ? 'bg-primary text-white' : 'hover:bg-canvas'}`}
              >
                {choice === 'keep' ? 'Unchanged' : choice === 'billable' ? 'Billable' : 'Non-billable'}
              </button>
            ))}
          </span>
        </div>
        <Button type="submit" disabled={!hasChanges}>
          Save
        </Button>
      </form>
    </Modal>
  )
}
