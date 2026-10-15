import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import type { Grouping, Resolution, SummaryReport } from '../../api/types'
import { DollarIcon } from '../../components/icons'
import { formatDuration } from '../../lib/time'
import { useGroupLabeler, withSeriesColors, type GroupLabel } from './groupLabels'

const HEIGHT = 344
const AXIS_WIDTH = 44
const FALLBACK_WIDTH = 720
const MAX_BAR_WIDTH = 80
const MIN_UPRIGHT_TICK_WIDTH = 76
const MIN_UPRIGHT_VALUE_WIDTH = 34
const AXIS_INTERVALS = 5
const QUARTER_HOUR = 0.25
const GAP = 2
const MAX_LEGEND_ITEMS = 8
const UPRIGHT_PLOT = { top: 36, bottom: 324 }
const ROTATED_PLOT = { top: 68, bottom: 279 }

type Bucket = SummaryReport['buckets'][number]

interface Series {
  key: string | null
  label: GroupLabel
}

function axisStep(maxHours: number): number {
  return Math.max(1, Math.ceil(maxHours / AXIS_INTERVALS / QUARTER_HOUR)) * QUARTER_HOUR
}

function axisLabel(hours: number): string {
  const whole = Math.floor(hours)
  const minutes = Math.round((hours - whole) * 60)
  return minutes ? `${whole}h ${String(minutes).padStart(2, '0')}` : `${whole}h`
}

function hoursLabel(seconds: number): string {
  return `${Number((seconds / 3600).toFixed(2))} h`
}

function parseDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function bucketLabel(start: string, resolution: Resolution): { strong: string; soft: string } {
  const date = parseDay(start)
  const short = date.toLocaleDateString([], { month: '2-digit', day: '2-digit' })
  if (resolution === 'month') return { strong: date.toLocaleDateString([], { month: 'short' }), soft: String(date.getFullYear()) }
  if (resolution === 'week') return { strong: 'Week of', soft: short }
  return { strong: date.toLocaleDateString([], { weekday: 'short' }), soft: short }
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

function stackOrder(buckets: Bucket[], stackBy: Grouping): Array<string | null> {
  if (stackBy === 'billable') return ['non_billable', 'billable']
  const totals = new Map<string | null, number>()
  for (const bucket of buckets) {
    for (const segment of bucket.segments) totals.set(segment.key, (totals.get(segment.key) ?? 0) + segment.seconds)
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key)
}

export function DurationChart({ report }: { report: SummaryReport }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const { ref, width } = useWidth()
  const labelOf = useGroupLabeler()
  const { buckets, resolution, stack_by: stackBy } = report
  const series: Series[] = withSeriesColors(
    stackOrder(buckets, stackBy)
      .filter((key) => buckets.some((bucket) => bucket.segments.some((segment) => segment.key === key && segment.seconds > 0)))
      .map((key) => ({ key, label: labelOf(stackBy, key) })),
  )
  const maxHours = Math.max(0, ...buckets.map((bucket) => bucket.seconds)) / 3600
  const step = axisStep(maxHours)
  const scaleMax = step * AXIS_INTERVALS
  const slotWidth = (width - AXIS_WIDTH) / Math.max(buckets.length, 1)
  const barWidth = Math.min(MAX_BAR_WIDTH, slotWidth / 2)
  const uprightTicks = slotWidth >= MIN_UPRIGHT_TICK_WIDTH
  const uprightValues = barWidth >= MIN_UPRIGHT_VALUE_WIDTH
  const plot = uprightTicks && uprightValues ? UPRIGHT_PLOT : ROTATED_PLOT
  const plotHeight = plot.bottom - plot.top
  const labelEvery = uprightTicks ? 1 : Math.max(1, Math.ceil(buckets.length / 16))
  const y = (hours: number) => plot.bottom - (plotHeight * hours) / scaleMax
  const hoveredBucket = hovered === null ? null : buckets[hovered]

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={HEIGHT} role="img" aria-label={`Hours per ${resolution}`}>
        {Array.from({ length: AXIS_INTERVALS + 1 }, (_, index) => (
          <g key={index}>
            <line
              x1={AXIS_WIDTH}
              x2={width}
              y1={y(step * index)}
              y2={y(step * index)}
              className="stroke-line"
              strokeDasharray={index === 0 ? undefined : '3 3'}
            />
            <text x={0} y={y(step * index) + 4} className="fill-ink-soft text-xs font-medium">
              {axisLabel(step * index)}
            </text>
          </g>
        ))}
        {buckets.map((bucket, index) => (
          <BucketBars
            key={bucket.start}
            bucket={bucket}
            series={series}
            x={AXIS_WIDTH + index * slotWidth + (slotWidth - barWidth) / 2}
            slotX={AXIS_WIDTH + index * slotWidth}
            slotWidth={slotWidth}
            barWidth={barWidth}
            plotBottom={plot.bottom}
            plotHeight={plotHeight}
            scaleMax={scaleMax}
            uprightTicks={uprightTicks}
            uprightValues={uprightValues}
            showTick={index % labelEvery === 0}
            resolution={resolution}
            isDimmed={hovered !== null && hovered !== index}
            onHover={(isHovered) => setHovered(isHovered ? index : null)}
          />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs font-medium">
        {series.slice(0, MAX_LEGEND_ITEMS).map(({ key, label }) => (
          <span key={key ?? 'none'} className="flex items-center gap-1.5">
            <span className="h-1.5 w-3.5 rounded-full" style={{ backgroundColor: label.color }} />
            {label.name}
          </span>
        ))}
      </div>
      {hoveredBucket && hoveredBucket.seconds > 0 && <BucketTooltip bucket={hoveredBucket} resolution={resolution} stackBy={stackBy} series={series} />}
    </div>
  )
}

interface BucketBarsProps {
  bucket: Bucket
  series: Series[]
  x: number
  slotX: number
  slotWidth: number
  barWidth: number
  plotBottom: number
  plotHeight: number
  scaleMax: number
  uprightTicks: boolean
  uprightValues: boolean
  showTick: boolean
  resolution: Resolution
  isDimmed: boolean
  onHover: (isHovered: boolean) => void
}

function BucketBars(props: BucketBarsProps) {
  const { bucket, series, x, slotX, slotWidth, barWidth, plotBottom, plotHeight, scaleMax, showTick, resolution, isDimmed, onHover } = props
  const { uprightTicks, uprightValues } = props
  const seconds = new Map(bucket.segments.map((segment) => [segment.key, segment.seconds]))
  const heights = series.map(({ key }) => (plotHeight * (seconds.get(key) ?? 0)) / 3600 / scaleMax)
  const tops = heights.map((_, index) => plotBottom - heights.slice(0, index + 1).reduce((sum, height) => sum + height, 0))
  const lastIndex = heights.findLastIndex((height) => height > 0)
  const barTop = lastIndex >= 0 ? tops[lastIndex] : plotBottom
  const center = x + barWidth / 2
  const tick = bucketLabel(bucket.start, resolution)

  return (
    <g onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)} className={isDimmed ? 'opacity-50' : ''}>
      <rect x={slotX} y={0} width={slotWidth} height={plotBottom} fill="transparent" />
      {series.map(({ key, label }, index) => {
        if (heights[index] <= 0) return null
        const isFirst = heights.slice(0, index).every((height) => height <= 0)
        const bottom = tops[index] + heights[index]
        return (
          <Bar
            key={key ?? 'none'}
            x={x}
            top={tops[index]}
            bottom={isFirst ? bottom : bottom - GAP}
            width={barWidth}
            roundTop={index === lastIndex}
            color={label.color}
          />
        )
      })}
      {bucket.seconds > 0 && (
        <text
          transform={uprightValues ? `translate(${center} ${barTop - 6})` : `translate(${center + 3} ${barTop - 5}) rotate(-90)`}
          textAnchor={uprightValues ? 'middle' : 'start'}
          className="fill-ink-soft text-[10px] font-medium tabular-nums"
        >
          {hoursLabel(bucket.seconds)}
        </text>
      )}
      {showTick && (
        <text
          transform={uprightTicks ? `translate(${center} ${plotBottom + 16})` : `translate(${center + 4} ${plotBottom + 14}) rotate(-45)`}
          textAnchor={uprightTicks ? 'middle' : 'end'}
          className="text-xs"
        >
          <tspan className="fill-ink">{tick.strong}</tspan>
          <tspan className="fill-muted"> {tick.soft}</tspan>
        </text>
      )}
    </g>
  )
}

function Bar({ x, top, bottom, width, roundTop, color }: { x: number; top: number; bottom: number; width: number; roundTop: boolean; color: string }) {
  const height = Math.max(0, bottom - top)
  const radius = roundTop ? Math.min(3, height, width / 2) : 0
  const path = `M${x},${bottom} V${top + radius} Q${x},${top} ${x + radius},${top} H${x + width - radius} Q${x + width},${top} ${x + width},${top + radius} V${bottom} Z`
  return <path d={path} style={{ fill: color }} />
}

interface BucketTooltipProps {
  bucket: Bucket
  resolution: Resolution
  stackBy: Grouping
  series: Series[]
}

function BucketTooltip({ bucket, resolution, stackBy, series }: BucketTooltipProps) {
  const labelOf = useGroupLabeler()
  const tick = bucketLabel(bucket.start, resolution)
  const seconds = new Map(bucket.segments.map((segment) => [segment.key, segment.seconds]))
  const isSplit = bucket.projects.some((project) => project.billable_seconds > 0 && project.billable_seconds < project.seconds)
  return (
    <div className="pointer-events-none absolute top-0 right-0 max-w-96 min-w-56 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold">
        {tick.strong} {tick.soft} · <span className="tabular-nums">{formatDuration(bucket.seconds)}</span>
      </p>
      {stackBy !== 'project' && (
        <>
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1">
            {series
              .filter(({ key }) => (seconds.get(key) ?? 0) > 0)
              .map(({ key, label }) => (
                <Fragment key={key ?? 'none'}>
                  <span className="h-1.5 w-3.5 rounded-full" style={{ backgroundColor: label.color }} />
                  <span className="truncate text-ink-soft">{label.name}</span>
                  <span className="text-right font-medium text-ink tabular-nums">{formatDuration(seconds.get(key) ?? 0)}</span>
                </Fragment>
              ))}
          </div>
          <p className="mt-2.5 mb-1 text-[10px] font-semibold tracking-wider text-muted uppercase">By project</p>
        </>
      )}
      <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 gap-y-1">
        {isSplit && (
          <>
            <span className="col-span-2" />
            <span className="text-right text-[11px] text-muted">Billable</span>
            <span className="text-right text-[11px] text-muted">Non-billable</span>
          </>
        )}
        {bucket.projects.map((project) => {
          const label = labelOf('project', project.key)
          const nonBillable = project.seconds - project.billable_seconds
          return (
            <Fragment key={project.key ?? 'none'}>
              <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} />
              <span className="truncate text-ink-soft">
                {label.name}
                {label.hint && <span className="text-muted"> · {label.hint}</span>}
              </span>
              {isSplit ? (
                <>
                  <span className="text-right font-medium text-ink tabular-nums">{project.billable_seconds ? formatDuration(project.billable_seconds) : '—'}</span>
                  <span className="text-right font-medium text-ink tabular-nums">{nonBillable ? formatDuration(nonBillable) : '—'}</span>
                </>
              ) : (
                <>
                  {project.billable_seconds > 0 ? <DollarIcon width={12} height={12} className="text-primary" aria-label="Billable" /> : <span />}
                  <span className="text-right font-medium text-ink tabular-nums">{formatDuration(project.seconds)}</span>
                </>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
