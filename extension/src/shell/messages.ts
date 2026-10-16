import type { TimeEntry } from '../types'

// Sent by the popup page the server hosts (frontend/src/extension-popup/shell.ts); keep both in sync.
export type ShellMessage =
  | { type: 'ready' }
  | { type: 'running'; entry: TimeEntry | null }
  | { type: 'problem' }
  | { type: 'open-tempo' }
  | { type: 'open-settings' }
