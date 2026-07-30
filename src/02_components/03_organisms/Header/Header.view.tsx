import React from 'react'
import { Theme, applyTheme } from '../../00_themes'
import { Dropdown } from '../../02_molecules/Dropdown/Dropdown'
import { Logo } from '../../01_atoms/Logo/Logo'
import { Frame, FrameProps } from '../../01_atoms/Frame/Frame'
import { Text } from '../../01_atoms/Text/Text'

interface HeaderProps extends FrameProps {
  currentTheme?: Theme
  onThemeChange?: (theme: Theme) => void
  showThemeSelector?: boolean
}

const THEME_OPTIONS = [
  { value: 'default',    label: 'DEFAULT_VIBE' },
  { value: 'houseplant', label: 'HOUSEPLANT_LIGHT' },
  { value: 'dark',       label: 'NIGHT_OPERATIONS' },
]

export const Header: React.FC<HeaderProps> = ({
  currentTheme = 'default',
  onThemeChange,
  showThemeSelector = false,
  className,
  variant = 'none',
  ...props
}) => {
  const handleThemeChange = (val: string | string[]) => {
    const next = val as Theme
    applyTheme(next)
    onThemeChange?.(next)
  }

  return (
    <Frame
      as="header"
      h={64}
      flow="horizontal"
      align="center"
      justify="between"
      padding={{ x: 24 }}
      variant={variant}
      fill={!props.fill ? { solid: 'bg-2' } : props.fill}
      stroke={{ bottom: { color: 'border-1' } }}
      sticky
      y={0}
      z={50}
      effects={{ 'background-blur': 12 }}
      transition="colors"
      className={className}
      {...props}
    >
      <Frame flow="horizontal" align="center" gap={16}>
        <Logo className="h-8 w-auto text-[var(--text-1)]" />
        <Frame
          padding={{ x: 8, y: 2 }}
          fill={{ solid: 'text-1' }}
          radius={2}
        >
          <Text variant="xs" transform="uppercase" tracking="widest" color="text-0">
            v0.1.0-alpha
          </Text>
        </Frame>
      </Frame>

      <Frame flow="horizontal" align="center" gap={24}>
        {showThemeSelector && (
          <Dropdown
            options={THEME_OPTIONS}
            value={currentTheme}
            onChange={handleThemeChange}
          />
        )}
        <Frame
          flow="vertical"
          align="end"
          stroke={{ left: { color: 'border-2', width: 2 } }}
          padding={{ left: 24 }}
          gap={2}
        >
          <Text variant="xs" transform="uppercase" tracking="widest" color="text-2">
            Active Project
          </Text>
          <Text variant="xs" transform="uppercase" tracking="wide" color="accent">
            IBCS_MISSION_ALPHA
          </Text>
        </Frame>
      </Frame>
    </Frame>
  )
}
