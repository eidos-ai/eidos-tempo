const EDGE_GAP = 8

// Shifts a dropdown left when it would overflow the popup's right edge, then scrolls it into view vertically.
export function keepInView(menu: HTMLElement | null): void {
  if (!menu) return
  menu.style.left = ''
  const overflow = menu.getBoundingClientRect().right - (document.documentElement.clientWidth - EDGE_GAP)
  if (overflow > 0) menu.style.left = `${-overflow}px`
  menu.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
