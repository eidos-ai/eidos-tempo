import type { Theme } from '../api/types'

const STORAGE_KEY = 'tempo-theme'

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (root.dataset.theme === theme) return
  root.classList.add('theme-switching')
  root.dataset.theme = theme
  void getComputedStyle(root).backgroundColor
  root.classList.remove('theme-switching')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage can be unavailable (private mode); the server keeps the real preference.
  }
}

export function cachedTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}
