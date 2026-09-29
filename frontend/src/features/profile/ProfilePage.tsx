import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { meApi } from '../../api/endpoints'
import { Button } from '../../components/Button'
import { ErrorMessage, Field, TextInput } from '../../components/Field'
import { PageHeader } from '../../components/PageHeader'
import { useCurrentUser } from '../auth/useAuth'

export function ProfilePage() {
  const user = useCurrentUser()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const changePassword = useMutation({
    mutationFn: () => meApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
    },
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    changePassword.mutate()
  }

  return (
    <>
      <PageHeader title="Profile" />
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-md space-y-6 rounded-xl border border-line bg-surface p-6">
          <div>
            <p className="font-display text-lg font-bold">{user.full_name}</p>
            <p className="text-sm text-ink-soft">
              {user.email} · <span className="capitalize">{user.role}</span>
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Current password">
              <TextInput type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </Field>
            <Field label="New password">
              <TextInput type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </Field>
            <ErrorMessage error={changePassword.error} />
            {changePassword.isSuccess && <p className="text-sm text-primary">Password updated.</p>}
            <Button type="submit" disabled={changePassword.isPending}>
              Change password
            </Button>
          </form>
        </div>
      </div>
    </>
  )
}
