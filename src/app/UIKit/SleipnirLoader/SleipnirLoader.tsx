import React, { useLayoutEffect, useRef } from 'react'
import horseSvg from './horse-gallop.svg?raw'
import { LOADER_CSS, loaderMarkup } from './loaderMarkup'
import { respectReducedMotion } from './reducedMotion'

let injected = false
function ensureCSS() {
  if (injected || typeof document === 'undefined') return
  const el = document.createElement('style')
  el.setAttribute('data-sleipnir-loader', '')
  el.textContent = LOADER_CSS
  document.head.appendChild(el)
  injected = true
}
ensureCSS()

// The markup is our own static asset, not user content.
const MARKUP = loaderMarkup(horseSvg)

interface SleipnirLoaderProps {
  /** Width in px — height follows the artwork. Default 32. */
  size?: number
  color?: string
  className?: string
}

// Sleipnir at the gallop (horse-gallop.svg). The horse paints in
// currentColor, so the default --text-1 reads light on the dark themes and
// near-black on light. The same markup is the boot screen in index.html (see
// loaderMarkup.ts).
export const SleipnirLoader: React.FC<SleipnirLoaderProps> = ({
  size = 32,
  color = 'var(--text-1)',
  className,
}) => {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (ref.current) respectReducedMotion(ref.current)
  }, [])
  return (
    <div
      ref={ref}
      className={className}
      style={{ width: size, color }}
      dangerouslySetInnerHTML={{ __html: MARKUP }}
    />
  )
}
