import React, { useEffect, useLayoutEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../Frame/Frame'
import { Icon, type IconName } from '../Icon/Icon'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface ContextMenuItem {
  label: string
  onSelect: () => void
  /** Optional leading icon, rendered before the label. */
  icon?: IconName
  /** Renders in red — for destructive actions like Delete. */
  destructive?: boolean
  /** Greyed out and non-clickable — e.g. "Paste" when the clipboard is empty. */
  disabled?: boolean
  /** Draws a hairline divider above this item, to group related actions. */
  separator?: boolean
}

export interface ContextMenuProps {
  /** Viewport coordinates to anchor at — pass clientX/clientY straight from the triggering onContextMenu event. */
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
  /** Any DOM node already inside the page's theme scope (e.g. the row that was right-clicked) — used only to find the nearest `.theme-*` ancestor to portal into, same reasoning as Dropdown's own portal (see its comment): every CSS custom property this menu reads (--bg-2, --text-2, ...) is scoped to that class, so a portal straight to document.body would render invisibly. */
  anchorEl: HTMLElement | null
}

// A minimal right-click menu, styled to match LeftRailingView's own
// hand-rolled sort-order popup rather than the Dropdown/Text component
// system — this is meant to sit inside that same dark, MONO-styled file
// tree. Unlike Dropdown, it anchors at a raw {x,y} viewport point (wherever
// the click landed) instead of a trigger element's bounding rect.
export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose, anchorEl }) => {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    let node: HTMLElement | null = anchorEl
    while (node && !Array.from(node.classList).some((c) => c.startsWith('theme-'))) {
      node = node.parentElement
    }
    setPortalTarget(node ?? document.body)
  }, [anchorEl])

  // mousedown (not click) so the same right-click that opens this menu — and
  // any left-click elsewhere — closes it, matching Dropdown's own outside-
  // click behavior. Registered on mount, which happens after the triggering
  // event has already finished dispatching, so it never sees its own opener.
  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!portalTarget) return null

  return ReactDOM.createPortal(
    <Frame
      fixed
      x={x}
      y={y}
      z={1000}
      flow="vertical"
      gap={0}
      padding={0}
      w={150}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      fill={{ solid: 'bg-2' }}
      stroke={{ color: 'var(--border-2)' }}
      radius="var(--radius-control)"
      // Clip so each item's now-square, full-width hover fill respects the
      // panel's own rounded outer corners instead of poking past them.
      clipContent
      style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}
    >
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {item.separator && i > 0 && (
            <div style={{ height: 1, margin: '2px 4px', background: 'rgba(var(--item-ink, 255,255,255), 0.08)' }} />
          )}
          <Frame
            as="button"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              item.onSelect()
              onClose()
            }}
            flow="horizontal"
            align="center"
            w="fill"
            minH={28}
            variant="none"
            hoverFill={item.disabled ? undefined : 'bg-3'}
            radius={0}
            padding={{ x: 10, y: 6 }}
            cursor={item.disabled ? 'default' : 'pointer'}
            gap={8}
            textColor={item.disabled ? 'var(--text-3)' : item.destructive ? '#e07a7a' : 'var(--text-2)'}
            style={{ textAlign: 'left', fontSize: 11, letterSpacing: '0.02em', opacity: item.disabled ? 0.5 : 1, ...MONO }}
          >
            {item.icon && <Icon name={item.icon} size={13} />}
            {item.label}
          </Frame>
        </React.Fragment>
      ))}
    </Frame>,
    portalTarget,
  )
}
