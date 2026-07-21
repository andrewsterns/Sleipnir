import React from 'react'
import { Frame, FrameProps } from '../../01_atoms/Frame/Frame'
import { Text } from '../../01_atoms/Text/Text'

export interface MenuCardProps extends Omit<FrameProps, 'variant'> {
  title: string
  icon?: React.ReactNode
  subtitle?: string
  /** Required — MenuCard is always interactive */
  onClick: React.MouseEventHandler<HTMLElement>
  variant?: 'primary' | 'surface' | 'accent'
}

export const MenuCard = React.forwardRef<HTMLElement, MenuCardProps>((
  {
    // ── MenuCard-specific ─────────────────────────────────────────────────────
    title,
    icon,
    subtitle,

    // ── Frame defaults — callers can override any of these ───────────────────
    as           = 'button',
    variant      = 'primary',
    flow         = 'vertical',
    align        = 'center',
    justify      = 'center',
    gap          = 16,
    padding      = { x: 40, y: 48 },
    radius       = 'var(--radius-1)',
    activeScale  = 0.98,
    transition   = 'all',

    // ── Everything else passes straight through to Frame ─────────────────────
    ...frameProps
  },
  ref
) => (
  <Frame
    as={as}
    ref={ref}
    variant={variant}
    flow={flow}
    align={align}
    justify={justify}
    gap={gap}
    padding={padding}
    radius={radius}
    activeScale={activeScale}
    transition={transition}
    {...frameProps}
  >
    {icon && (
      <Frame flow="horizontal" align="center" justify="center">
        {icon}
      </Frame>
    )}
    <Text variant="h4" weight="black" italic transform="uppercase" tracking="tight">
      {title}
    </Text>
    {subtitle && (
      <Text variant="xs" tracking="widest" transform="uppercase" color="text-3">
        {subtitle}
      </Text>
    )}
  </Frame>
))

MenuCard.displayName = 'MenuCard'
