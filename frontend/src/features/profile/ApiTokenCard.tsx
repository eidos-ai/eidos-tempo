import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { meApi } from '../../api/endpoints'
import { queryKeys } from '../../api/queryKeys'
import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/Field'

export function ApiTokenCard() {
  const queryClient = useQueryClient()
  const [issuedToken, setIssuedToken] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)
  const token = useQuery({ queryKey: queryKeys.apiToken, queryFn: meApi.apiToken })
  const issue = useMutation({
    mutationFn: meApi.issueApiToken,
    onSuccess: (issued) => {
      setIssuedToken(issued.token)
      setIsCopied(false)
      queryClient.setQueryData(queryKeys.apiToken, { created_at: issued.created_at })
    },
  })
  const revoke = useMutation({
    mutationFn: meApi.revokeApiToken,
    onSuccess: () => {
      setIssuedToken(null)
      queryClient.setQueryData(queryKeys.apiToken, null)
    },
  })

  const copy = async () => {
    if (!issuedToken) return
    await navigator.clipboard.writeText(issuedToken)
    setIsCopied(true)
  }

  const createdAt = token.data ? new Date(token.data.created_at).toLocaleDateString() : null

  return (
    <section className="max-w-md space-y-4 rounded-xl border border-line bg-surface p-6">
      <div>
        <h2 className="font-display text-lg font-bold">API token</h2>
        <p className="text-sm text-ink-soft">
          For scripts. It works like a Toggl API token: send it as the Basic auth user with the password{' '}
          <code className="rounded bg-canvas px-1">api_token</code>.
        </p>
      </div>

      {issuedToken && (
        <div className="space-y-2 rounded-lg border border-line bg-canvas p-3">
          <p className="text-sm text-ink-soft">Copy it now; it won't be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-sm text-ink">{issuedToken}</code>
            <Button type="button" variant="secondary" onClick={() => void copy()}>
              {isCopied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}

      {!issuedToken && (
        <p className="text-sm text-ink-soft">{createdAt ? `Created on ${createdAt}.` : 'You have no API token.'}</p>
      )}

      <ErrorMessage error={issue.error ?? revoke.error} />
      <div className="flex gap-2">
        <Button type="button" onClick={() => issue.mutate()} disabled={issue.isPending || token.isPending}>
          {token.data ? 'Regenerate' : 'Generate token'}
        </Button>
        {token.data && (
          <Button type="button" variant="danger" onClick={() => revoke.mutate()} disabled={revoke.isPending}>
            Revoke
          </Button>
        )}
      </div>
      {token.data && !issuedToken && (
        <p className="text-xs text-muted">Regenerating or revoking stops the current token from working.</p>
      )}
    </section>
  )
}
