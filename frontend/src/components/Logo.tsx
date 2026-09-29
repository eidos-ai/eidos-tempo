import logo from '../assets/brand/eidos-logo.png'

const LOGO_ASPECT_RATIO = 1880 / 500

export function Logo({ height }: { height: number }) {
  return (
    <span
      role="img"
      aria-label="eidos.ai"
      className="block bg-logo"
      style={{
        height,
        width: height * LOGO_ASPECT_RATIO,
        maskImage: `url(${logo})`,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
      }}
    />
  )
}
