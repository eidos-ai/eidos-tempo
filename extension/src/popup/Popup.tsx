import { useEffect, useMemo } from 'react'
import { getServerUrl } from '../config'
import type { ApiError } from '../api'
import { ExternalIcon, RefreshIcon, SettingsIcon } from './icons'
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
    <div className="flex h-[600px] w-[450px] flex-col bg-canvas">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-surface pr-2 pl-4">
        <span role="img" aria-label="eidos.ai" className="wordmark h-[18px]" />
        <span className="mx-2.5 h-4 w-px bg-line-strong" aria-hidden="true" />
        <span className="flex-1 font-display text-[15px] font-medium text-ink-soft">Tempo</span>
        <HeaderButton label="Open Eidos Tempo" onClick={() => void openTempo()}>
          <ExternalIcon width={16} height={16} />
        </HeaderButton>
        <HeaderButton label="Refresh" onClick={tempo.reload}>
          <RefreshIcon width={16} height={16} />
        </HeaderButton>
        <HeaderButton label="Settings" onClick={() => void chrome.runtime.openOptionsPage()}>
          <SettingsIcon width={16} height={16} />
        </HeaderButton>
      </header>

      {tempo.status === 'loading' && (
        <div className="flex flex-1 items-center justify-center" role="status" aria-label="Loading">
          <span className="size-6 animate-spin rounded-full border-2 border-line-strong border-t-primary" />
        </div>
      )}

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
            tags={data.tags}
            isBusy={tempo.isBusy}
            onCreateTag={tempo.createTag}
            onStart={(input) => void tempo.start(input)}
            onStop={() => void tempo.stop()}
            onUpdateRunning={(entry, input) => void tempo.updateRunning(entry, input)}
          />
          <RecentEntries
            entries={data.recent}
            suggestions={data.suggestions}
            running={data.running}
            lookups={lookups}
            isBusy={tempo.isBusy}
            onUpdate={(entries, input) => void tempo.updateEntries(entries, input)}
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
      className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink"
    >
      {children}
    </button>
  )
}

function SignedOut({ problem, onRetry }: { problem: ApiError; onRetry: () => void }) {
  const isLoggedOut = problem.kind === 'not-logged-in'
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <span role="img" aria-label="eidos.ai" className="wordmark h-8" />
      <p className="text-sm text-ink-soft">
        {isLoggedOut ? 'Log in to Eidos Tempo in this browser to start tracking time here.' : problem.message}
      </p>
      {isLoggedOut ? (
        <button
          type="button"
          onClick={() => void openTempo()}
          className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-strong"
        >
          Log in to Eidos Tempo
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-strong"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => void chrome.runtime.openOptionsPage()}
            className="h-10 rounded-lg border border-line bg-surface px-5 text-sm font-semibold text-ink hover:bg-canvas"
          >
            Settings
          </button>
        </div>
      )}
    </div>
  )
}
