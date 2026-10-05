import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { timeEntriesApi } from '../../api/endpoints'
import type { Project, TrackingStory } from '../../api/types'
import { CloseIcon } from '../../components/icons'
import { NO_PROJECT_COLOR, projectTextColor } from '../../lib/colors'
import { useClientLookup } from '../clients/useClients'
import { useProjectLookup } from '../projects/useProjects'

const COUNT_UP_MS = 1400
const FIRST_MONDAY = new Date(2024, 0, 1)

function useCountUp(target: number): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    const startedAt = performance.now()
    let frame = 0
    const tick = (time: number) => {
      const progress = Math.min((time - startedAt) / COUNT_UP_MS, 1)
      setValue(Math.round(target * (1 - (1 - progress) ** 3)))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target])
  return value
}

function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

function formatHoursMinutes(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

function weekdayName(weekday: number): string {
  const date = new Date(FIRST_MONDAY)
  date.setDate(date.getDate() + weekday)
  return date.toLocaleDateString([], { weekday: 'long' })
}

const longDate = (date: Date) => date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
const delay = (step: number): CSSProperties => ({ animationDelay: `${150 + step * 90}ms` })

export function TempoStory({ onClose }: { onClose: () => void }) {
  const story = useQuery({
    queryKey: ['time-entries', 'story'],
    queryFn: () => timeEntriesApi.story(Intl.DateTimeFormat().resolvedOptions().timeZone),
    staleTime: 0,
  })

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Your Eidos story"
        className="w-full max-w-lg animate-story-in overflow-hidden rounded-3xl bg-surface shadow-2xl motion-reduce:animate-none"
      >
        {story.data ? (
          <StoryContent story={story.data} onClose={onClose} />
        ) : (
          <Header onClose={onClose}>
            <p className="py-6 text-lg text-white/80">
              {story.isError ? "Couldn't load your story. Try again later." : 'Rewinding the clock…'}
            </p>
          </Header>
        )}
      </div>
    </div>
  )
}

function Header({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary-strong to-deep px-7 pt-6 pb-7 text-white">
      <span
        aria-hidden
        className="absolute -top-16 -right-16 size-64 animate-drift bg-white/10 motion-reduce:animate-none"
        style={{ maskImage: 'url(/eidos-isotype.png)', maskSize: 'contain', maskRepeat: 'no-repeat' }}
      />
      <div className="relative flex items-start justify-between">
        <p className="text-xs font-semibold tracking-[0.2em] text-white/70 uppercase">Your Eidos story</p>
        <button onClick={onClose} aria-label="Close" className="-mt-1 -mr-2 rounded-full p-1 text-white/70 hover:text-white">
          <CloseIcon />
        </button>
      </div>
      <div className="relative">{children}</div>
    </div>
  )
}

function StoryContent({ story, onClose }: { story: TrackingStory; onClose: () => void }) {
  const projects = useProjectLookup()
  const clients = useClientLookup()
  const hours = useCountUp(Math.round(story.total_seconds / 3600))

  if (story.first_day === null) {
    return (
      <Header onClose={onClose}>
        <p className="pt-6 font-display text-3xl font-bold">Every story starts somewhere.</p>
        <p className="pt-2 pb-2 text-white/80">Track your first entry and come back.</p>
      </Header>
    )
  }

  const longest = story.longest_entry
  const longestProject = longest?.project_id ? projects.get(longest.project_id) : undefined
  const longestClient = longestProject?.client_id ? clients.get(longestProject.client_id) : undefined

  return (
    <>
      <Header onClose={onClose}>
        <p className="pt-1 text-sm text-white/80">Tracking since {longDate(parseDay(story.first_day))}</p>
        <p className="pt-5 font-display text-6xl leading-none font-bold tabular-nums">
          {hours.toLocaleString()}
          <span className="pl-2 text-2xl font-semibold text-white/80">hours</span>
        </p>
        <p className="pt-3 text-sm text-white/80">
          {story.entry_count.toLocaleString()} entries across {story.days_tracked.toLocaleString()} days
        </p>
      </Header>

      <div className="grid grid-cols-2 gap-3 px-7 pt-6">
        {story.busiest_day && (
          <Stat step={0} label="Busiest day" value={formatHoursMinutes(story.busiest_day.seconds)}>
            {longDate(parseDay(story.busiest_day.day))}
          </Stat>
        )}
        <Stat step={1} label="Longest streak" value={`${story.longest_streak} days`}>
          in a row, weekends off
        </Stat>
        {longest && (
          <Stat step={2} label="Longest entry" value={formatHoursMinutes(longest.seconds)}>
            {longest.description || 'No description'}
            <span className="block truncate">
              <span className="font-medium" style={{ color: projectTextColor(longestProject?.color ?? NO_PROJECT_COLOR) }}>
                {longestProject?.name ?? 'No project'}
              </span>
              {longestClient && <span className="text-muted"> · {longestClient.name}</span>}
            </span>
          </Stat>
        )}
        {story.favorite_weekday !== null && (
          <Stat step={3} label="Power day" value={`${weekdayName(story.favorite_weekday)}s`}>
            your most tracked weekday
          </Stat>
        )}
      </div>

      <TopProjects story={story} projects={projects} />
    </>
  )
}

function Stat({ step, label, value, children }: { step: number; label: string; value: string; children: ReactNode }) {
  return (
    <div className="animate-story-rise rounded-2xl bg-canvas px-4 py-3 motion-reduce:animate-none" style={delay(step)}>
      <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</p>
      <p className="pt-1 font-display text-xl font-bold tabular-nums">{value}</p>
      <p className="truncate text-xs text-ink-soft">{children}</p>
    </div>
  )
}

function TopProjects({ story, projects }: { story: TrackingStory; projects: Map<string, Project> }) {
  const clients = useClientLookup()
  if (story.top_projects.length === 0) return null

  return (
    <div className="animate-story-rise px-7 pt-6 pb-7 motion-reduce:animate-none" style={delay(4)}>
      <p className="pb-3 text-[11px] font-semibold tracking-wider text-muted uppercase">Where your time went</p>
      <ol className="space-y-3">
        {story.top_projects.map((total) => {
          const project = total.project_id ? projects.get(total.project_id) : undefined
          const client = project?.client_id ? clients.get(project.client_id) : undefined
          const color = project?.color ?? NO_PROJECT_COLOR
          const share = total.seconds / story.total_seconds
          return (
            <li key={total.project_id ?? 'none'}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium" style={{ color: projectTextColor(color) }}>
                  {project?.name ?? 'No project'}
                  {client && <span className="font-normal text-muted"> · {client.name}</span>}
                </span>
                <span className="shrink-0 text-muted tabular-nums">
                  {Math.round(total.seconds / 3600).toLocaleString()} h · {Math.round(share * 100)}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
                <div
                  className="h-full origin-left animate-story-rise rounded-full motion-reduce:animate-none"
                  style={{ width: `${share * 100}%`, backgroundColor: color }}
                />
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
