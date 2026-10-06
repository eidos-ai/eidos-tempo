import { useState } from 'react'
import type { SummaryReport } from '../../api/types'
import { formatDuration } from '../../lib/time'
import { GROUPING_SINGULAR, useGroupLabeler, withSeriesColors } from './groupLabels'

const SIZE = 260
const CENTER = SIZE / 2
const OUTER = 72
const INNER = 50
const LABEL_RADIUS = 92
const MIN_LABELED_SHARE = 0.05
const FULL_CIRCLE = Math.PI * 2
const MAX_SLICES = 8
const OTHER_KEY = '__other__'

function point(angle: number, radius: number): [number, number] {
  return [CENTER + radius * Math.sin(angle), CENTER - radius * Math.cos(angle)]
}

function arcPath(start: number, end: number): string {
  const sweep = Math.min(end - start, FULL_CIRCLE - 1e-4)
  const finish = start + sweep
  const large = sweep > Math.PI ? 1 : 0
  return [
    `M${point(start, OUTER).join(',')}`,
    `A${OUTER},${OUTER} 0 ${large} 1 ${point(finish, OUTER).join(',')}`,
    `L${point(finish, INNER).join(',')}`,
    `A${INNER},${INNER} 0 ${large} 0 ${point(start, INNER).join(',')}`,
    'Z',
  ].join(' ')
}

function percent(seconds: number, total: number, digits = 2): string {
  return total ? `${((seconds / total) * 100).toFixed(digits)}%` : '0%'
}

export function DistributionDonut({ report }: { report: SummaryReport }) {
  const labelOf = useGroupLabeler()
  const [hovered, setHovered] = useState<string | null>(null)
  const nonEmpty = report.slices.filter((share) => share.seconds > 0)
  const otherSeconds = nonEmpty.slice(MAX_SLICES).reduce((sum, share) => sum + share.seconds, 0)
  const shares = nonEmpty.length > MAX_SLICES + 1 ? [...nonEmpty.slice(0, MAX_SLICES), { key: OTHER_KEY, seconds: otherSeconds }] : nonEmpty
  const total = shares.reduce((sum, share) => sum + share.seconds, 0)
  const starts = shares.map((_, index) => shares.slice(0, index).reduce((sum, share) => sum + (share.seconds / total) * FULL_CIRCLE, 0))
  const slices = withSeriesColors(
    shares.map((share, index) => ({
      ...share,
      id: share.key ?? 'none',
      label:
        share.key === OTHER_KEY
          ? { name: `Other (${nonEmpty.length - MAX_SLICES})`, hint: null, color: 'var(--color-line-strong)', isEmpty: true, isProject: false }
          : labelOf(report.slice_by, share.key),
      start: starts[index],
      end: starts[index] + (share.seconds / total) * FULL_CIRCLE,
    })),
  )
  const hoveredSlice = slices.find((slice) => slice.id === hovered)

  if (total === 0) return <p className="py-20 text-center text-sm text-muted">No time tracked</p>

  return (
    <div className="flex items-center gap-2">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Time by ${report.slice_by}`} className="shrink-0">
        {slices.map((slice) => (
          <path
            key={slice.id}
            d={arcPath(slice.start, slice.end)}
            style={{ fill: slice.label.color }}
            className={`stroke-surface ${hovered && hovered !== slice.id ? 'opacity-40' : ''}`}
            strokeWidth={slices.length > 1 ? 2 : 0}
            onMouseEnter={() => setHovered(slice.id)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        {slices
          .filter((slice) => slice.seconds / total >= MIN_LABELED_SHARE)
          .map((slice) => {
            const middle = (slice.start + slice.end) / 2
            const [x, y] = point(middle, LABEL_RADIUS)
            return (
              <text
                key={slice.id}
                x={x}
                y={y + 4}
                textAnchor={Math.sin(middle) >= 0 ? 'start' : 'end'}
                className="fill-ink-soft text-xs font-medium"
              >
                {percent(slice.seconds, total, 1)}
              </text>
            )
          })}
        <text x={CENTER} y={CENTER + 3} textAnchor="middle" className="fill-ink text-base font-semibold tabular-nums">
          {formatDuration(hoveredSlice?.seconds ?? total)}
        </text>
        <text x={CENTER} y={CENTER + 19} textAnchor="middle" className="fill-muted text-[10px] font-semibold tracking-wider uppercase">
          {hoveredSlice ? percent(hoveredSlice.seconds, total) : GROUPING_SINGULAR[report.slice_by]}
        </text>
      </svg>
      <ul className="max-h-64 min-w-0 flex-1 space-y-2 overflow-y-auto text-sm font-medium">
        {slices.map((slice) => (
          <li
            key={slice.id}
            className={`flex items-start gap-2 rounded-md px-1 ${hovered === slice.id ? 'bg-canvas' : ''}`}
            onMouseEnter={() => setHovered(slice.id)}
            onMouseLeave={() => setHovered(null)}
            title={`${slice.label.name}: ${formatDuration(slice.seconds)}`}
          >
            <span className="mt-1.5 size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: slice.label.color }} />
            <span className="min-w-0 flex-1">
              <span className={`block truncate ${slice.label.isEmpty ? 'text-muted' : ''}`}>{slice.label.name}</span>
              {slice.label.hint && <span className="block truncate text-muted">• {slice.label.hint}</span>}
            </span>
            <span className="text-muted tabular-nums">{percent(slice.seconds, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
