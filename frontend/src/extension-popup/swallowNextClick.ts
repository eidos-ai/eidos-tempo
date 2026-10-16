export function swallowNextClick(): void {
  const swallow = (event: MouseEvent) => event.stopPropagation()
  window.addEventListener('click', swallow, { capture: true, once: true })
  window.addEventListener('mouseup', () => setTimeout(() => window.removeEventListener('click', swallow, true)), {
    once: true,
  })
}
