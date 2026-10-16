const THEME_KEY = 'theme'

export function applyCachedTheme(): void {
  try {
    const theme = localStorage.getItem(THEME_KEY)
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
  } catch {
    // Storage unavailable in this frame: the theme is applied once the user loads.
  }
}

export function cacheTheme(theme: string): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Storage unavailable in this frame: the next open flashes the default theme.
  }
}
