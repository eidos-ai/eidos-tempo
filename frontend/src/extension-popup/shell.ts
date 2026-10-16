import type { TimeEntry } from './types'

// The extension's popup is a thin shell that shows this page in an iframe. Things only the extension
// can do (toolbar icon, opening tabs and its settings) are asked of the shell with postMessage.
// Keep these messages in sync with extension/src/shell/messages.ts.
export type ShellMessage =
  | { type: 'ready' }
  | { type: 'running'; entry: TimeEntry | null }
  | { type: 'problem' }
  | { type: 'open-tempo' }
  | { type: 'open-settings' }

function shellOrigin(): string | null {
  if (window.parent === window) return null
  return window.location.ancestorOrigins[0] ?? null
}

function tell(message: ShellMessage): boolean {
  const origin = shellOrigin()
  if (!origin) return false
  window.parent.postMessage(message, origin)
  return true
}

export function announceReady(): void {
  tell({ type: 'ready' })
}

export async function showRunning(entry: TimeEntry | null): Promise<void> {
  tell({ type: 'running', entry })
}

export async function showProblem(): Promise<void> {
  tell({ type: 'problem' })
}

export function openTempo(): void {
  if (!tell({ type: 'open-tempo' })) window.open('/', '_blank')
}

export function openSettings(): void {
  tell({ type: 'open-settings' })
}
