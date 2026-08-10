import React from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon, type IconName } from '../UIKit/Icon/Icon'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface NavRailItem {
  id: string
  tag: string
  title: string
  icon: IconName
}

/** A single icon button pinned to the bottom of the rail, below a flexible spacer — visually part of the rail but not a category (doesn't flow through onSelect/activeId). Used for Settings, which toggles a dock panel rather than switching what's showing in the main content area. */
export interface NavRailBottomAction {
  title: string
  icon: IconName
  active: boolean
  onClick: () => void
}

interface NavRailProps {
  items: NavRailItem[]
  activeId: string
  /** Secondary (split-view) category, if any — see App.tsx's switchTo. Only used to decide which rail buttons get the secondary indicator dot below. */
  secondaryId?: string | null
  /** `e` is passed through so callers can detect a Ctrl/Cmd-click ("open in split view beside the current category") vs. a plain click ("switch to it"). */
  onSelect: (id: string, e?: React.MouseEvent) => void
  bottomAction?: NavRailBottomAction
}

function NavRailButton({
  icon,
  title,
  tag,
  active,
  secondary,
  onClick,
}: {
  icon: IconName
  title: string
  tag?: string
  active: boolean
  secondary?: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={onClick}
      title={title}
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
      {secondary && (
        <div
          title="Open in split view"
          style={{
            position: 'absolute',
            right: 6,
            top: 6,
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: 'var(--text-2)',
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
        <Icon name={icon} size={15} />
      </span>
      {tag && (
        <span
          style={{
            fontSize: 7,
            letterSpacing: '0.1em',
            color: active ? 'var(--text-2)' : 'var(--text-3)',
          }}
        >
          {tag}
        </span>
      )}
    </button>
  )
}

export const NavRail: React.FC<NavRailProps> = ({ items, activeId, secondaryId, onSelect, bottomAction }) => (
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
    {items.map((item) => (
      <NavRailButton
        key={item.id}
        icon={item.icon}
        title={`${item.title} — Ctrl/Cmd-click to open in split view`}
        tag={item.tag}
        active={item.id === activeId}
        secondary={item.id === secondaryId}
        onClick={(e) => onSelect(item.id, e)}
      />
    ))}
    {bottomAction && (
      <>
        <Frame grow minH={0} />
        <NavRailButton
          icon={bottomAction.icon}
          title={bottomAction.title}
          active={bottomAction.active}
          onClick={bottomAction.onClick}
        />
      </>
    )}
  </Frame>
)
