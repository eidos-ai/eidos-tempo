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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await send(method, path, body)
  if (GATEWAY_STATUSES.has(response.status)) {
    throw new ApiError(response.status, UNREACHABLE_MESSAGE)
  }
  if (response.status === TOO_MANY_REQUESTS) {
    throw new ApiError(response.status, RATE_LIMITED_MESSAGE)
  }
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response))
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: (path: string) => request<void>('DELETE', path),
}
