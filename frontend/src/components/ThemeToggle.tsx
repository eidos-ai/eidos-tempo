import { useCurrentUser, usePreferenceSetter } from '../features/auth/useAuth'
import { MoonIcon, SunIcon } from './icons'

export function ThemeToggle() {
  const { preferences } = useCurrentUser()
  const setPreference = usePreferenceSetter()
  const isDark = preferences.theme === 'dark'

  return (
    <button
      role="switch"
      aria-checked={isDark}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setPreference('theme', isDark ? 'light' : 'dark')}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
    >
      <span>{isDark ? 'Dark theme' : 'Light theme'}</span>
      <span className="relative flex h-7 w-14 items-center justify-between rounded-full border border-line-strong bg-canvas px-1.5 text-muted">
        <SunIcon className="size-3.5" />
        <MoonIcon className="size-3.5" />
        <span
          className={`absolute top-0.5 left-0.5 flex size-[22px] items-center justify-center rounded-full bg-surface shadow-md transition-transform duration-200 ${isDark ? 'translate-x-7' : 'translate-x-0'}`}
        >
          {isDark ? <MoonIcon className="size-3.5 text-accent" /> : <SunIcon className="size-3.5 text-[#B8925F]" />}
        </span>
      </span>
    </button>
  )
}
