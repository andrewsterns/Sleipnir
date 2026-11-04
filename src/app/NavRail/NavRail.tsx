import React from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon, type IconName } from '../UIKit/Icon/Icon'
import { useAppTheme } from '../../themes/ThemeController'

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

// One rail entry: the view's icon on a soft rounded wash when active. The
// view's name lives in the tooltip, so the rail stays a quiet column of icons.
function NavRailButton({
  icon,
  title,
  active,
  secondary,
  onClick,
}: {
  icon: IconName
  title: string
  active: boolean
  secondary?: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-current={active ? 'page' : undefined}
      className={active ? undefined : 'icon-btn'}
      style={{
        position: 'relative',
        width: 32,
        height: 32,
        flexShrink: 0,
        borderRadius: 'var(--radius-3)',
        background: active ? 'rgba(var(--item-ink, 255,255,255), 0.12)' : 'transparent',
        color: active ? 'var(--text-1)' : 'var(--text-3)',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color 120ms ease, color 120ms ease',
      }}
    >
      {secondary && (
        <div
          title="Open in split view"
          style={{
            position: 'absolute',
            right: 3,
            top: 3,
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: 'var(--text-2)',
          }}
        />
      )}
      <Icon name={icon} size={16} />
    </button>
  )
}

export const NavRail: React.FC<NavRailProps> = ({ items, activeId, secondaryId, onSelect, bottomAction }) => {
  const { theme } = useAppTheme()
  return (
  <Frame
    as="nav"
    theme={theme}
    flow="vertical"
    minW={44}
    w={44}
    h="fill"
    fill={{ solid: 'bg-1' }}
    stroke={{ right: { color: 'var(--border-1)' } }}
    padding={{ y: 10 }}
    gap={6}
    align="center"
  >
    {items.map((item) => (
      <NavRailButton
        key={item.id}
        icon={item.icon}
        title={`${item.title} — Ctrl/Cmd-click to open in split view`}
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
}
