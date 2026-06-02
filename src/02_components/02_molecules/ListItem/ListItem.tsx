import React, { useState } from 'react'
import { Frame, FrameProps } from '../../01_atoms/Frame/Frame'
import { Text } from '../../01_atoms/Text/Text'

export interface ListItemProps extends Omit<FrameProps, 'onClick'> {
  id: string
  title: string
  subtitle?: string
  isActive?: boolean
  /** Soft highlight from an external source (e.g. hovering the name in the code panel) */
  isHovered?: boolean
  onClick?: (id: string) => void
}

export const ListItem = React.forwardRef<HTMLElement, ListItemProps>((
  {
    // ── ListItem-specific ─────────────────────────────────────────────────────
    id,
    title,
    subtitle,
    isActive  = false,
    isHovered = false,
    onClick,

    // ── Frame defaults ────────────────────────────────────────────────────────
    as = 'li',
    w  = 'fill',

    // ── Everything else passes straight through ───────────────────────────────
    ...frameProps
  },
  ref
) => {
  const [mouseOver, setMouseOver] = useState(false)

  const bg = isActive   ? 'primary-3'
           : isHovered  ? 'primary-4'
           : mouseOver  ? 'primary-5'
           : 'transparent'

  return (
    <Frame as={as} ref={ref} w={w} {...frameProps}>
      <Frame
        as="button"
        onClick={() => onClick?.(id)}
        onHover={() => setMouseOver(true)}
        onHoverEnd={() => setMouseOver(false)}
        w="fill"
        flow="vertical"
        align="start"
        gap={3}
        padding={{ x: 12, y: 10 }}
        radius="var(--radius-1)"
        fill={{ solid: bg }}
        stroke={isHovered && !isActive ? { color: 'border-2' } : undefined}
        transition="colors"
      >
        <Text
          variant="xs"
          weight={isActive ? 'bold' : 'normal'}
          color={isActive ? 'text-0' : isHovered ? 'text-1' : 'text-2'}
          transform="uppercase"
          tracking="wide"
          leading="tight"
        >
          {title}
        </Text>
        {subtitle && (
          <Text variant="xs" color="text-3" tracking="normal">
            {subtitle}
          </Text>
        )}
      </Frame>
    </Frame>
  )
})

ListItem.displayName = 'ListItem'
