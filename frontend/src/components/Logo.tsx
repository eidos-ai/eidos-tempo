import type { CSSProperties } from 'react'
import logo from '../assets/brand/eidos-logo.svg'

const LOGO_HEIGHT_PX = 500
const LOGO_WIDTH_PX = 1880
const ISOTYPE_WIDTH_PX = 490

interface LogoProps {
  height: number
  isotypeClassName?: string
}

export function Logo({ height, isotypeClassName = '' }: LogoProps) {
  const scale = height / LOGO_HEIGHT_PX
  const part = (position: 'left' | 'right', widthPx: number): CSSProperties => ({
    height,
    width: widthPx * scale,
    maskImage: `url(${logo})`,
    maskSize: `${LOGO_WIDTH_PX * scale}px ${height}px`,
    maskPosition: position,
    maskRepeat: 'no-repeat',
  })

  return (
    <span role="img" aria-label="eidos.ai" className="flex">
      <span className={`block origin-[49%_52%] bg-logo ${isotypeClassName}`} style={part('left', ISOTYPE_WIDTH_PX)} />
      <span className="block bg-logo" style={part('right', LOGO_WIDTH_PX - ISOTYPE_WIDTH_PX)} />
    </span>
  )
}
