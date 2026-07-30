import React from 'react'
import { Frame, FrameProps } from '../../01_atoms/Frame/Frame'

export type CardProps = FrameProps

/**
 * Card — the base surface molecule. A Frame preset: surface fill, vertical
 * flow, padding, radius and an elevation shadow. Organisms (Counter,
 * MenuCard, ...) compose on top of it; every default is overridable.
 */
export const Card = React.forwardRef<HTMLElement, CardProps>((
  {
    variant = 'surface',
    flow = 'vertical',
    padding = 24,
    gap = 16,
    radius = 'var(--radius-2)',
    effects = { 'drop-shadow': { y: 2, blur: 12, color: 'rgba(0,0,0,0.2)' } },
    ...props
  },
  ref
) => (
  <Frame
    ref={ref}
    variant={variant}
    flow={flow}
    padding={padding}
    gap={gap}
    radius={radius}
    effects={effects}
    {...props}
  />
))

Card.displayName = 'Card'
