import React from 'react'
import { Frame, type FrameProps } from '../Frame/Frame'
import { Icon, type IconName } from '../Icon/Icon'
import { cn } from '../../../utils/cn'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }

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
// <button style={{}}>, so "invisible at rest, brightens on hover" is a
// property of the component instead of something each call site has to
// remember to wire up itself. The hover cue is a colour swap, not a fill box:
// the glyph brightens to `hoverTextColor` (defaults to full ink) on hover,
// with no background — so a dense list of ⋯ / trash actions stays quiet until
// reached, then sits on a soft rounded ink wash (`.icon-btn` in index.css).
// Built on CSS :hover rules, not JS hover state.
export const IconButton = React.forwardRef<HTMLElement, IconButtonProps>((
  {
    icon,
    glyph,
    iconSize = 16,
    size = 28,
    title,
    hoverFill,
    hoverTextColor = 'var(--text-1)',
    radius = 'var(--radius-2)',
    textColor = 'var(--text-2)',
    transition = 'colors',
    focusRing = true,
    activeScale = 0.96,
    className,
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
    hoverTextColor={hoverTextColor}
    radius={radius}
    textColor={textColor}
    transition={transition}
    focusRing={focusRing}
    activeScale={activeScale}
    disabledOpacity={disabledOpacity}
    disabledPointerEvents={disabledPointerEvents}
    cursor={cursor}
    className={cn('icon-btn', className)}
    {...frameProps}
  >
    {icon ? <Icon name={icon} size={iconSize} /> : <span style={{ fontSize: iconSize, lineHeight: 1, ...UI_FONT }}>{glyph}</span>}
  </Frame>
))

IconButton.displayName = 'IconButton'
