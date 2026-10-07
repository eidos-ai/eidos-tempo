const EDGE_GAP = 8

function resetSidewaysScroll(menu: HTMLElement): void {
  for (let element: Element | null = menu.parentElement; element; element = element.parentElement) element.scrollLeft = 0
}

// Shifts a dropdown left when it would overflow the popup's right edge (the body's fixed width, not the
// window, which Chrome would widen to fit the dropdown), then scrolls it into view vertically only.
// Focusing the dropdown's search box and scrollIntoView both scroll sideways, even where overflow is
// hidden, which moves the whole popup; that scroll is undone before measuring and after scrolling.
export function keepInView(menu: HTMLElement | null): void {
  if (!menu) return
  resetSidewaysScroll(menu)
  menu.style.left = ''
  const overflow = menu.getBoundingClientRect().right - (document.body.getBoundingClientRect().right - EDGE_GAP)
  if (overflow > 0) menu.style.left = `${-overflow}px`
  menu.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  resetSidewaysScroll(menu)
}
