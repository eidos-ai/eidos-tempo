import { useCallback, useRef, useState, type ReactNode } from 'react'
import { NavLink, useParams, useSearchParams } from 'react-router-dom'
import type { Grouping, ReportKind } from '../../api/types'
import { DownloadIcon } from '../../components/icons'
import { DetailedTable } from './DetailedTable'
import { DistributionDonut } from './DistributionDonut'
import { DurationChart } from './DurationChart'
import { GROUPING_NAMES, GROUPING_SINGULAR } from './groupLabels'
import { BreakdownTable } from './BreakdownTable'
import { ReportFilterBar } from './ReportFilterBar'
import { presetLabel, readFilters, writeFilters, type ReportFilters } from './reportFilters'
import { ReportTotals } from './ReportTotals'
import { SelectMenu } from './SelectMenu'
import { useDismiss } from './useDismiss'
import { useExportPdf, useReportEntries, useSummaryReport } from './useReports'

const TABS: Array<{ kind: ReportKind; label: string }> = [
  { kind: 'summary', label: 'Summary' },
  { kind: 'detailed', label: 'Detailed' },
]

const STACK_OPTIONS = (['billable', 'member', 'client', 'project'] as const).map((value) => ({ value, label: GROUPING_NAMES[value] }))
const SLICE_OPTIONS = (['billable', 'member', 'client', 'project', 'description'] as const).map((value) => ({
  value,
  label: GROUPING_NAMES[value],
}))

export function ReportsPage() {
  const kind: ReportKind = useParams().kind === 'detailed' ? 'detailed' : 'summary'
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readFilters(searchParams)
  const summary = useSummaryReport(filters)
  const updateFilters = (changes: Partial<ReportFilters>) =>
    setSearchParams(writeFilters({ ...filters, ...changes }), { replace: true })

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-line bg-surface px-6">
        <h1 className="text-sm font-medium">Reports</h1>
        <nav className="flex h-full gap-5">
          {TABS.map((tab) => (
            <NavLink
              key={tab.kind}
              to={{ pathname: `/reports/${tab.kind}`, search: searchParams.toString() }}
              className={({ isActive }) =>
                `flex items-center border-b-2 pt-0.5 text-sm font-semibold ${
                  isActive ? 'border-primary text-accent' : 'border-transparent text-muted hover:text-ink'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <ExportMenu kind={kind} filters={filters} />
      </header>
      <ReportFilterBar filters={filters} onChange={updateFilters} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {summary.isError && (
          <p className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">The report could not be loaded: {summary.error.message}</p>
        )}
        <ReportTotals report={summary.data} />
        {kind === 'summary' ? (
          <SummaryContent filters={filters} onChange={updateFilters} />
        ) : (
          <DetailedContent filters={filters} />
        )}
      </div>
    </>
  )
}

function ExportMenu({ kind, filters }: { kind: ReportKind; filters: ReportFilters }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(containerRef, isOpen, close)
  const exportPdf = useExportPdf()

  return (
    <div ref={containerRef} className="relative ml-auto">
      <button
        type="button"
        disabled={exportPdf.isPending}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-canvas disabled:opacity-50"
      >
        <DownloadIcon width={16} height={16} />
        {exportPdf.isPending ? 'Exporting…' : 'Export'}
      </button>
      {isOpen && (
        <div className="absolute top-full right-0 z-40 mt-1 w-44 rounded-lg border border-line bg-surface p-1 shadow-xl">
          <button
            type="button"
            className="w-full rounded-md px-3 py-1.5 text-left text-sm font-medium hover:bg-canvas"
            onClick={() => {
              setIsOpen(false)
              exportPdf.mutate({ kind, filters })
            }}
          >
            Download PDF
          </button>
        </div>
      )}
    </div>
  )
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-line bg-surface p-5">
      <header className="mb-3 flex min-h-9 items-center justify-between gap-3">
        <h2 className="min-w-0 text-sm font-semibold">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

function SummaryContent({ filters, onChange }: { filters: ReportFilters; onChange: (changes: Partial<ReportFilters>) => void }) {
  const { data: report } = useSummaryReport(filters)
  if (!report) return <p className="py-12 text-center text-sm text-muted">Loading…</p>

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card
          title={`Duration by ${report.resolution}`}
          action={
            <SelectMenu label="Stack by" value={report.stack_by} options={STACK_OPTIONS} onChange={(stackBy: Grouping) => onChange({ stackBy })} />
          }
        >
          <DurationChart report={report} />
        </Card>
        <Card
          title={`${GROUPING_SINGULAR[report.slice_by]} distribution`}
          action={
            <SelectMenu label="Slice by" value={report.slice_by} options={SLICE_OPTIONS} onChange={(sliceBy: Grouping) => onChange({ sliceBy })} />
          }
        >
          <DistributionDonut report={report} />
        </Card>
      </div>
      <BreakdownTable report={report} onGroupingChange={(groupBy, subgroupBy) => onChange({ groupBy, subgroupBy })} />
    </>
  )
}

function DetailedContent({ filters }: { filters: ReportFilters }) {
  const { data: entries = [], isPending } = useReportEntries(filters)
  const period = presetLabel(filters.from, filters.to)
  const title = period ? `Time entries from ${period.toLowerCase()}` : 'Time entries'
  return <DetailedTable title={title} entries={entries} isLoading={isPending} />
}
