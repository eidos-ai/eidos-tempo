import type { ReactNode } from 'react'

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-canvas/60 text-left text-[11px] tracking-wider text-muted uppercase">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-5 py-3 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  )
}

export function StatusBadge({ active, activeLabel = 'Active', inactiveLabel = 'Archived' }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${active ? 'bg-primary-soft text-accent' : 'bg-canvas text-muted'}`}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  )
}
