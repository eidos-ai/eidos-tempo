const VIEWPORT_MARGIN = 8

export function shouldOpenUpward(trigger: HTMLElement, dropdownHeight: number): boolean {
  const rect = trigger.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN
  const spaceAbove = rect.top - VIEWPORT_MARGIN
  return spaceBelow < dropdownHeight && spaceAbove > spaceBelow
}
