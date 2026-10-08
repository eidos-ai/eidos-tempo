export const DEFAULT_SERVER_URL = 'https://tempo.eidos.ai'

const SERVER_URL_KEY = 'serverUrl'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

export async function getServerUrl(): Promise<string> {
  const stored = await chrome.storage.sync.get(SERVER_URL_KEY)
  const value = stored[SERVER_URL_KEY]
  return typeof value === 'string' ? value : DEFAULT_SERVER_URL
}

export async function setServerUrl(serverUrl: string): Promise<void> {
  await chrome.storage.sync.set({ [SERVER_URL_KEY]: serverUrl })
}

export function normalizeServerUrl(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const isLocal = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !isLocal) return null
  return url.origin
}

export function originPermission(serverUrl: string): string {
  return `${new URL(serverUrl).origin}/*`
}
