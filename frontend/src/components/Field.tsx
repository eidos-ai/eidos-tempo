import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export const CONTROL_CLASSES =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20'

interface FieldProps {
  label: string
  children: ReactNode
}

export function Field({ label, children }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">{label}</span>
      {children}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={CONTROL_CLASSES} {...props} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={CONTROL_CLASSES} {...props} />
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-primary" {...props} />
      {label}
    </label>
  )
}

export function ErrorMessage({ error }: { error: Error | null }) {
  if (!error) return null
  return <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error.message}</p>
}
