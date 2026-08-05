import React from 'react'

let injected = false
function ensureCSS() {
  if (injected || typeof document === 'undefined') return
  const el = document.createElement('style')
  el.setAttribute('data-sleipnir-loader-kf', '')
  el.textContent = `
    @keyframes sleipnir-gallop {
      0%, 100% { transform: scaleY(1); opacity: 0.5; }
      50% { transform: scaleY(0.35); opacity: 1; }
    }
  `
  document.head.appendChild(el)
  injected = true
}
ensureCSS()

const LEG_COUNT = 8

interface SleipnirLoaderProps {
  /** Overall width in px — height follows at a fixed ratio. Default 32. */
  size?: number
  color?: string
  className?: string
}

// Eight thin legs galloping in a left-to-right wave, under a body line —
// Sleipnir's eight legs, abstracted to match the app's line-art icon
// language (see Icon.tsx/Logo.tsx). Used as the AI chat's "thinking"
// indicator for the gap between sending a message and the first token.
export const SleipnirLoader: React.FC<SleipnirLoaderProps> = ({ size = 32, color = 'var(--text-2)', className }) => {
  const height = size * 0.5
  const bodyY = height * 0.22
  const legBottom = height * 0.92

  return (
    <svg width={size} height={height} viewBox={`0 0 ${size} ${height}`} className={className} style={{ display: 'block' }}>
      <line x1={0} y1={bodyY} x2={size} y2={bodyY} stroke={color} strokeWidth={1} opacity={0.35} />
      {Array.from({ length: LEG_COUNT }).map((_, i) => {
        const x = (i + 0.5) * (size / LEG_COUNT)
        const delay = (i / LEG_COUNT) * 0.7
        return (
          <line
            key={i}
            x1={x}
            y1={bodyY}
            x2={x}
            y2={legBottom}
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            style={{
              transformBox: 'fill-box',
              transformOrigin: 'top',
              animation: `sleipnir-gallop 0.7s ease-in-out ${delay}s infinite`,
            }}
          />
        )
      })}
    </svg>
  )
}
