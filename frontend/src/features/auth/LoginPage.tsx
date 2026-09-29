import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import logo from '../../assets/brand/eidos-logo.png'
import { Button } from '../../components/Button'
import { ErrorMessage, Field, TextInput } from '../../components/Field'
import { useLogin, useSession } from './useAuth'

export function LoginPage() {
  const { data: user } = useSession()
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (user) return <Navigate to="/timer" replace />

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate({ email, password })
  }

  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-sand via-rose to-lavender p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5 rounded-2xl bg-surface p-8 shadow-xl">
        <div className="space-y-2">
          <img src={logo} alt="eidos.ai" className="h-8 w-auto" />
          <p className="text-sm text-ink-soft">Tempo · time tracking</p>
        </div>
        <Field label="Email">
          <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Password">
          <TextInput
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <ErrorMessage error={login.error} />
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </div>
  )
}
