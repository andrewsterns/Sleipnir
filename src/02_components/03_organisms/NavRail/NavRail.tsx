import React from 'react'
import { Frame } from '../../01_atoms/Frame/Frame'
import { Icon, type IconName } from '../../01_atoms/Icon/Icon'
import { Logo } from '../../01_atoms/Logo/Logo'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface NavRailItem {
  id: string
  tag: string
  title: string
  icon: IconName
}

interface NavRailProps {
  items: NavRailItem[]
  activeId: string
  onSelect: (id: string) => void
}

export const NavRail: React.FC<NavRailProps> = ({ items, activeId, onSelect }) => (
  <Frame
    as="nav"
    theme="tactical"
    flow="vertical"
    minW={44}
    w={44}
    h="fill"
    fill={{ solid: 'bg-1' }}
    stroke={{ right: { color: 'rgba(255,255,255,0.08)' } }}
    padding={{ y: 10 }}
    gap={2}
    align="center"
  >
    <div style={{ padding: '0 0 10px', display: 'flex', justifyContent: 'center', color: 'var(--text-1)' }}>
      <Logo className="h-4 w-auto" />
    </div>
    {items.map((item) => {
      const active = item.id === activeId
      return (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          title={item.title}
          style={{
            position: 'relative',
            width: '100%',
            background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '7px 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            ...MONO,
          }}
        >
          {active && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 6,
                bottom: 6,
                width: 2,
                background: 'var(--text-1)',
              }}
            />
          )}
          <span
            style={{
              color: active ? 'var(--text-1)' : 'var(--text-3)',
              opacity: active ? 1 : 0.7,
              display: 'flex',
            }}
          >
            <Icon name={item.icon} size={15} />
          </span>
          <span
            style={{
              fontSize: 7,
              letterSpacing: '0.1em',
              color: active ? 'var(--text-2)' : 'var(--text-3)',
            }}
          >
            {item.tag}
          </span>
        </button>
      )
    })}
  </Frame>
)
