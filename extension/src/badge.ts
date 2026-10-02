import type { TimeEntry } from './types'

const IDLE_COLOR = '#8a88a8'
const RUNNING_COLOR = '#7b4de7'
const PROBLEM_COLOR = '#c93c3c'
const ICON_SIZES = [16, 32]
const DESIGN_SIZE = 32
const STROKE_WIDTH = 2.6

interface Ring {
  centerX: number
  centerY: number
  radius: number
  sides: number
}

const TOOLBAR_MARK: Ring[] = [
  { centerX: 16, centerY: 16.5, radius: 13.4, sides: 6 },
  { centerX: 14.6, centerY: 14.4, radius: 8.2, sides: 6 },
  { centerX: 13.6, centerY: 12.8, radius: 3.4, sides: 5 },
]

function tracePolygon(context: OffscreenCanvasRenderingContext2D, ring: Ring): void {
  context.beginPath()
  for (let corner = 0; corner < ring.sides; corner++) {
    const angle = -Math.PI / 2 + (corner * 2 * Math.PI) / ring.sides
    const x = ring.centerX + ring.radius * Math.cos(angle)
    const y = ring.centerY + ring.radius * Math.sin(angle)
    if (corner === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.closePath()
}

export function toolbarIcon(color: string): Record<string, ImageData> {
  const images: Record<string, ImageData> = {}
  for (const size of ICON_SIZES) {
    const context = new OffscreenCanvas(size, size).getContext('2d')
    if (!context) throw new Error('OffscreenCanvas 2D context is not available')
    context.scale(size / DESIGN_SIZE, size / DESIGN_SIZE)
    context.strokeStyle = color
    context.lineWidth = STROKE_WIDTH
    context.lineJoin = 'round'
    for (const ring of TOOLBAR_MARK) {
      tracePolygon(context, ring)
      context.stroke()
    }
    images[String(size)] = context.getImageData(0, 0, size, size)
  }
  return images
}

export async function showRunning(entry: TimeEntry | null): Promise<void> {
  await chrome.action.setIcon({ imageData: toolbarIcon(entry ? RUNNING_COLOR : IDLE_COLOR) })
  await chrome.action.setBadgeText({ text: '' })
  await chrome.action.setTitle({
    title: entry ? `Eidos Tempo: ${entry.description || '(no description)'} (running)` : 'Eidos Tempo',
  })
}

export async function showProblem(): Promise<void> {
  await chrome.action.setIcon({ imageData: toolbarIcon(IDLE_COLOR) })
  await chrome.action.setBadgeBackgroundColor({ color: PROBLEM_COLOR })
  await chrome.action.setBadgeText({ text: '!' })
  await chrome.action.setTitle({ title: 'Eidos Tempo: not connected' })
}
