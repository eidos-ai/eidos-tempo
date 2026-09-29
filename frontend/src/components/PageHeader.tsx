import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  actions?: ReactNode
}

export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-8">
      <h1 className="font-display text-xl font-bold">{title}</h1>
      <div className="flex items-center gap-3">{actions}</div>
    </header>
  )
}
