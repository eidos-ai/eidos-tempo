export const THEME_KEY = 'theme'

export function applyCachedTheme(): void {
  const theme = localStorage.getItem(THEME_KEY)
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
}
