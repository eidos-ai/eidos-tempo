import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, tempoApi } from '../api'
import { DEFAULT_SERVER_URL, getServerUrl, normalizeServerUrl, originPermission, setServerUrl } from '../config'

interface Report {
  kind: 'status' | 'error'
  message: string
}

async function testConnection(): Promise<Report> {
  try {
    const me = await tempoApi.me()
    document.documentElement.dataset.theme = me.preferences.theme
    return { kind: 'status', message: `Connected as ${me.full_name}.` }
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'not-logged-in') {
      return { kind: 'status', message: 'Saved. Log in to Eidos Tempo in this browser to finish connecting.' }
    }
    return { kind: 'error', message: `Saved, but the connection failed: ${error instanceof Error ? error.message : 'unexpected error'}` }
  }
}

export function Options() {
  const [serverUrl, setServerUrlInput] = useState('')
  const [report, setReport] = useState<Report | null>(null)

  useEffect(() => {
    void getServerUrl().then(setServerUrlInput)
  }, [])

  const save = async (input: string) => {
    const normalized = normalizeServerUrl(input)
    if (!normalized) {
      setReport({ kind: 'error', message: 'Enter an https:// address, or http://localhost for development.' })
      return
    }
    const granted = await chrome.permissions.request({ origins: [originPermission(normalized)] })
    if (!granted) {
      setReport({ kind: 'error', message: 'The extension needs permission to reach that address.' })
      return
    }
    await setServerUrl(normalized)
    setServerUrlInput(normalized)
    setReport(await testConnection())
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void save(serverUrl)
  }

  return (
    <main className="mx-auto mt-10 max-w-lg overflow-hidden rounded-xl border border-line">
      <header className="flex items-center gap-2 border-b border-line bg-canvas px-5 py-3">
        <span className="logo size-5" aria-hidden="true" />
        <h1 className="font-display font-semibold">Eidos Tempo settings</h1>
      </header>
      <form onSubmit={handleSubmit} className="space-y-3 p-5">
        <label htmlFor="server-url" className="block text-sm font-semibold">
          Eidos Tempo address
        </label>
        <input
          id="server-url"
          value={serverUrl}
          onChange={(event) => setServerUrlInput(event.target.value)}
          placeholder="https://tempo.example.com"
          autoComplete="off"
          required
          className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <p className="text-sm text-muted">
          The address where you open Eidos Tempo. Only https:// addresses are allowed, except localhost.
        </p>
        <div className="flex gap-2">
          <button type="submit" className="h-10 rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-strong">
            Save and test
          </button>
          <button
            type="button"
            onClick={() => void save(DEFAULT_SERVER_URL)}
            className="h-10 rounded-lg bg-primary-soft px-4 font-semibold text-ink"
          >
            Use default
          </button>
        </div>
        {report && (
          <p
            role={report.kind === 'error' ? 'alert' : 'status'}
            className={`rounded-lg px-3 py-2 text-sm ${report.kind === 'error' ? 'bg-danger/10 text-danger' : 'bg-primary-soft text-ink'}`}
          >
            {report.message}
          </p>
        )}
      </form>
    </main>
  )
}
