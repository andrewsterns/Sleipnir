import React from 'react'
import { Card, CardProps } from '../../02_molecules/Card/Card'
import { Frame } from '../../01_atoms/Frame/Frame'
import { Text } from '../../01_atoms/Text/Text'

export interface MenuCardProps extends Omit<CardProps, 'variant'> {
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

    // ── Card defaults — callers can override any of these ────────────────────
    as           = 'button',
    variant      = 'primary',
    align        = 'center',
    justify      = 'center',
    padding      = { x: 40, y: 48 },
    radius       = 'var(--radius-1)',
    effects      = {},
    activeScale  = 0.98,
    transition   = 'all',

    // ── Everything else passes straight through to Card/Frame ────────────────
    ...cardProps
  },
  ref
) => (
  <Card
    as={as}
    ref={ref}
    variant={variant}
    align={align}
    justify={justify}
    padding={padding}
    radius={radius}
    effects={effects}
    activeScale={activeScale}
    transition={transition}
    {...cardProps}
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
  </Card>
))

MenuCard.displayName = 'MenuCard'
