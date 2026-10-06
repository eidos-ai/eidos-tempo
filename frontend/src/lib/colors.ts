export const PROJECT_COLORS = [
  '#7B4DE7',
  '#5325B8',
  '#2D008C',
  '#9D9AC8',
  '#D4A8AD',
  '#B9737C',
  '#E1CCB3',
  '#B8925F',
  '#3F8F87',
  '#2F6FDB',
  '#E26D5C',
  '#181633',
]

export const NO_PROJECT_COLOR = '#9D9AC8'

export function projectTextColor(color: string): string {
  return `oklch(from ${color} max(l, var(--project-text-min-lightness)) c h)`
}

export function projectTint(color: string, strength = 1): string {
  return `color-mix(in srgb, ${color} calc(var(--project-tint) * ${strength}), transparent)`
}
