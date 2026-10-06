export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const UNREACHABLE_MESSAGE = "Can't reach the server. Your change was not saved; please try again."
const GATEWAY_STATUSES = new Set([502, 503, 504])
const TOO_MANY_REQUESTS = 429
const RATE_LIMITED_MESSAGE = 'Too many attempts. Please wait a minute and try again.'

interface ValidationIssue {
  msg: string
}

interface ErrorBody {
  detail?: string | ValidationIssue[]
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ErrorBody
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail)) return body.detail.map((issue) => issue.msg).join(', ')
  } catch {
    // Response body is not JSON; fall back to the status text.
  }
  return response.statusText || 'Request failed'
}

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  try {
    return await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, UNREACHABLE_MESSAGE)
  }
}

async function checked(response: Response): Promise<Response> {
  if (GATEWAY_STATUSES.has(response.status)) {
    throw new ApiError(response.status, UNREACHABLE_MESSAGE)
  }
  if (response.status === TOO_MANY_REQUESTS) {
    throw new ApiError(response.status, RATE_LIMITED_MESSAGE)
  }
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response))
  }
  return response
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await checked(await send(method, path, body))
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export interface DownloadedFile {
  blob: Blob
  filename: string
}

const FILENAME_PATTERN = /filename="([^"]+)"/

async function download(path: string): Promise<DownloadedFile> {
  const response = await checked(await send('GET', path))
  const filename = FILENAME_PATTERN.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'download'
  return { blob: await response.blob(), filename }
}

export const http = {
  download,
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: (path: string) => request<void>('DELETE', path),
}
