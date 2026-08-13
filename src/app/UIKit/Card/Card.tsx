import React from 'react'
import { Frame, type FrameProps } from '../Frame/Frame'

export interface CardProps extends Omit<FrameProps, 'variant'> {}

// The app's one reusable "card" surface — modals, the detail panel, any
// floating popover. Deliberately matches the right-click menu / Dropdown menu
// language: a plain dark `surface`, rounded to the shared --radius-control,
// with a soft drop shadow. It replaces the old TacticalPanel (angular chamfer
// corners + diagonal scanline fill + gradient stroke), which read as a louder,
// separate HUD language from the rest of the UI. Every Frame prop passes
// through, so callers still set flow/gap/padding/w/maxH/scroll/relative etc.;
// only the surface look (variant/radius/shadow) is fixed here so cards can't
// drift apart again. Override `radius`/`effects` only for a deliberate one-off.
export const Card = React.forwardRef<HTMLElement, CardProps>((
  { radius, effects, children, ...props },
  ref,
) => (
  <Frame
    ref={ref}
    variant="surface"
    radius={radius ?? 'var(--radius-control)'}
    effects={effects ?? { 'drop-shadow': { x: 0, y: 8, blur: 24, spread: 0, color: 'rgba(0,0,0,0.35)' } }}
    {...props}
  >
    {children}
  </Frame>
))

Card.displayName = 'Card'
