import type { ComponentType, SVGProps } from 'react'
import { NavLink } from 'react-router-dom'
import logo from '../assets/brand/eidos-logo.png'
import { useCurrentUser, useLogout } from '../features/auth/useAuth'
import { BriefcaseIcon, ClockIcon, FolderIcon, LogOutIcon, UserIcon, UsersIcon } from './icons'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

const TRACK_ITEMS: NavItem[] = [{ to: '/timer', label: 'Timer', icon: ClockIcon }]
const MANAGE_ITEMS: NavItem[] = [
  { to: '/projects', label: 'Projects', icon: FolderIcon },
  { to: '/clients', label: 'Clients', icon: BriefcaseIcon },
]
const ADMIN_ITEMS: NavItem[] = [{ to: '/members', label: 'Members', icon: UsersIcon }]

function NavSection({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div className="space-y-1">
      <p className="px-3 text-[11px] font-semibold tracking-wider text-muted uppercase">{title}</p>
      {items.map(({ to, label, icon: ItemIcon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-primary-soft text-primary-strong' : 'text-ink-soft hover:bg-canvas hover:text-ink'
            }`
          }
        >
          <ItemIcon />
          {label}
        </NavLink>
      ))}
    </div>
  )
}

export function Sidebar() {
  const user = useCurrentUser()
  const logout = useLogout()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface">
      <div className="px-5 py-5">
        <img src={logo} alt="eidos.ai" className="h-7 w-auto" />
      </div>
      <nav className="flex-1 space-y-6 px-3 py-2">
        <NavSection title="Track" items={TRACK_ITEMS} />
        <NavSection title="Manage" items={MANAGE_ITEMS} />
        {user.role === 'admin' && <NavSection title="Admin" items={ADMIN_ITEMS} />}
      </nav>
      <div className="space-y-1 border-t border-line px-3 py-3">
        <NavLink
          to="/profile"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-canvas hover:text-ink"
        >
          <UserIcon />
          <span className="truncate">{user.full_name}</span>
        </NavLink>
        <button
          onClick={() => logout.mutate()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-canvas hover:text-ink"
        >
          <LogOutIcon />
          Log out
        </button>
      </div>
    </aside>
  )
}
