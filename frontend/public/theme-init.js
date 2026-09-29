try {
  if (localStorage.getItem('tempo-theme') === 'dark') document.documentElement.dataset.theme = 'dark'
} catch {
  // Storage unavailable: the app applies the user's theme after loading.
}
