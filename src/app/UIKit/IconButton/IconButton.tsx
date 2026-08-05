import React from 'react'
import { Frame, type FrameProps } from '../Frame/Frame'
import { Icon, type IconName } from '../Icon/Icon'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface IconButtonProps extends Omit<FrameProps, 'children' | 'variant'> {
  /** Renders this icon centered in the button. */
  icon?: IconName
  /** Renders a raw glyph ("+", "×", "✓", ...) instead of an Icon, for the handful of text-glyph actions with no icon asset. */
  glyph?: string
  /** Icon/glyph size in px. @default 16 */
  iconSize?: number
  /** Click-box size (width & height), independent of iconSize — a small icon still gets a comfortable hit target. @default 28 */
  size?: number
  title?: string
}

// The one ghost icon-button implementation for dense areas (file trees,
// sidebar rows, tab strips, docks) — every hover-revealed row action across
// the app's ScrollWindow-based lists renders through this, not a hand-rolled
// <button style={{}}>, so "invisible at rest, a rounded fill appears on
// hover" is a property of the component instead of something each call site
// has to remember to wire up itself. Built on Frame's own hoverFill (the
// same mechanism Button's ghost/outline variants already use), not local
// hover state — a real CSS :hover rule, not a JS-driven background swap.
export const IconButton = React.forwardRef<HTMLElement, IconButtonProps>((
  {
    icon,
    glyph,
    iconSize = 16,
    size = 28,
    title,
    hoverFill = 'bg-2',
    radius = 4,
    textColor = 'var(--text-1)',
    transition = 'colors',
    focusRing = true,
    activeScale = 0.95,
    disabledOpacity = true,
    disabledPointerEvents = true,
    as = 'button',
    layout = 'inline-flex',
    align = 'center',
    justify = 'center',
    shrink = 0,
    cursor = 'pointer',
    ...frameProps
  },
  ref,
) => (
  <Frame
    as={as}
    ref={ref}
    title={title}
    layout={layout}
    align={align}
    justify={justify}
    w={size}
    h={size}
    shrink={shrink}
    variant="none"
    hoverFill={hoverFill}
    radius={radius}
    textColor={textColor}
    transition={transition}
    focusRing={focusRing}
    activeScale={activeScale}
    disabledOpacity={disabledOpacity}
    disabledPointerEvents={disabledPointerEvents}
    cursor={cursor}
    {...frameProps}
  >
    {icon ? <Icon name={icon} size={iconSize} /> : <span style={{ fontSize: iconSize, lineHeight: 1, ...MONO }}>{glyph}</span>}
  </Frame>
))

IconButton.displayName = 'IconButton'
