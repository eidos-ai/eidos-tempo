import type { SummaryReport } from '../../api/types'
import { formatDuration } from '../../lib/time'

export function ReportTotals({ report }: { report: SummaryReport | undefined }) {
  const total = report?.total.seconds ?? 0
  const billable = report?.total.billable_seconds ?? 0
  const share = total ? `${((billable / total) * 100).toFixed(2)}%` : null

  return (
    <section className="grid grid-cols-3 rounded-lg border border-line bg-surface p-3">
      <Stat label="Total Hours" value={formatDuration(total)} />
      <Stat label="Billable Hours" value={billable ? `${formatDuration(billable)}${share ? ` (${share})` : ''}` : '-'} />
      <Stat
        label="Average Daily Hours"
        value={((report?.average_daily_seconds ?? 0) / 3600).toFixed(2)}
        unit="Hours"
      />
    </section>
  )
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="border-l border-line px-5 first:border-l-0 first:pl-2">
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-muted">{unit}</span>}
      </p>
    </div>
  )
}
