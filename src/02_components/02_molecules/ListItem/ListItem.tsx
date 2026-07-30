import React from 'react'
import { Frame } from '../../01_atoms/Frame/Frame'
import { Text } from '../../01_atoms/Text/Text'
import { ListItemProps } from './iListItem'
import { useListItemViewModel } from './ListItemViewModel'

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
  const { bg, onHover, onHoverEnd } = useListItemViewModel({ isActive, isHovered })

  return (
    <Frame as={as} ref={ref} w={w} {...frameProps}>
      <Frame
        as="button"
        onClick={() => onClick?.(id)}
        onHover={onHover}
        onHoverEnd={onHoverEnd}
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
