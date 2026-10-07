const EDGE_GAP = 8

// Shifts a dropdown left when it would overflow the popup's right edge (the body's fixed width, not the
// window, which Chrome would widen to fit the dropdown), then scrolls it into view vertically.
export function keepInView(menu: HTMLElement | null): void {
  if (!menu) return
  menu.style.left = ''
  const overflow = menu.getBoundingClientRect().right - (document.body.getBoundingClientRect().right - EDGE_GAP)
  if (overflow > 0) menu.style.left = `${-overflow}px`
  menu.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
