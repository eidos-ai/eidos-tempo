import { useEffect, useMemo } from 'react'
import { getServerUrl } from '../config'
import type { ApiError } from '../api'
import { ExternalIcon, SettingsIcon } from './icons'
import { buildLookups } from './lookups'
import { RecentEntries } from './RecentEntries'
import { TimerBar } from './TimerBar'
import { useTempo } from './useTempo'
import { THEME_KEY } from './theme'

async function openTempo(): Promise<void> {
  await chrome.tabs.create({ url: await getServerUrl() })
  window.close()
}

export function Popup() {
  const tempo = useTempo()
  const { data } = tempo
  const lookups = useMemo(() => buildLookups(data?.projects ?? [], data?.clients ?? []), [data?.projects, data?.clients])

  useEffect(() => {
    if (!data) return
    document.documentElement.dataset.theme = data.me.preferences.theme
    localStorage.setItem(THEME_KEY, data.me.preferences.theme)
  }, [data])

  return (
    <div className="flex h-[540px] w-[400px] flex-col">
      <header className="flex items-center gap-2 border-b border-line bg-canvas px-4 py-2">
        <span className="logo size-5" aria-hidden="true" />
        <span className="flex-1 font-display font-semibold">Eidos Tempo</span>
        <HeaderButton label="Open Eidos Tempo" onClick={() => void openTempo()}>
          <ExternalIcon width={16} height={16} />
        </HeaderButton>
        <HeaderButton label="Settings" onClick={() => void chrome.runtime.openOptionsPage()}>
          <SettingsIcon width={16} height={16} />
        </HeaderButton>
      </header>

      {tempo.status === 'loading' && <p className="px-4 py-10 text-center text-sm text-muted">Loading…</p>}

      {tempo.status === 'signed-out' && tempo.problem && (
        <SignedOut problem={tempo.problem} onRetry={tempo.reload} />
      )}

      {tempo.error && (
        <div role="alert" className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          <p className="flex-1">{tempo.error}</p>
          <button type="button" onClick={tempo.dismissError} aria-label="Dismiss" className="font-semibold">
            ×
          </button>
        </div>
      )}

      {tempo.status === 'ready' && data && (
        <>
          <TimerBar
            running={data.running}
            suggestions={data.suggestions}
            lookups={lookups}
            isBusy={tempo.isBusy}
            onStart={(input) => void tempo.start(input)}
            onStop={() => void tempo.stop()}
            onUpdateRunning={(entry, input) => void tempo.updateRunning(entry, input)}
          />
          <RecentEntries
            entries={data.recent}
            running={data.running}
            lookups={lookups}
            isBusy={tempo.isBusy}
            onContinue={(entry) =>
              void tempo.start({
                description: entry.description,
                project_id: entry.project_id,
                is_billable: entry.is_billable,
                tag_ids: entry.tag_ids,
              })
            }
          />
        </>
      )}
    </div>
  )
}

function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-md p-1.5 text-ink-soft hover:bg-surface hover:text-ink"
    >
      {children}
    </button>
  )
}

function SignedOut({ problem, onRetry }: { problem: ApiError; onRetry: () => void }) {
  const isLoggedOut = problem.kind === 'not-logged-in'
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="logo size-14" aria-hidden="true" />
      <p className="text-sm text-ink-soft">
        {isLoggedOut ? 'Log in to Eidos Tempo in this browser to start tracking time here.' : problem.message}
      </p>
      {isLoggedOut ? (
        <button
          type="button"
          onClick={() => void openTempo()}
          className="h-10 rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-strong"
        >
          Log in to Eidos Tempo
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="h-10 rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-strong"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => void chrome.runtime.openOptionsPage()}
            className="h-10 rounded-lg bg-primary-soft px-5 font-semibold text-ink"
          >
            Settings
          </button>
        </div>
      )}
    </div>
  )
}
