import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../Frame/Frame'
import { Icon, type IconName } from '../Icon/Icon'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface ContextMenuItem {
  label: string
  /** Fired when the (leaf) item is chosen. Optional for a submenu parent, which acts through its `children` instead. */
  onSelect?: () => void
  /** Optional leading icon, rendered before the label. */
  icon?: IconName
  /** Renders in red — for destructive actions like Delete. */
  destructive?: boolean
  /** Greyed out and non-clickable — e.g. "Paste" when the clipboard is empty. */
  disabled?: boolean
  /** Draws a hairline divider above this item, to group related actions. */
  separator?: boolean
  /** Nested items — turns this row into a submenu that flies out to the side (e.g. "Add node ▸" → a plan to pick). One level deep only. */
  children?: ContextMenuItem[]
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

const MENU_W = 150
const SUBMENU_W = 168
const ROW_H = 30

// A single selectable row — shared by the top-level menu and every submenu
// flyout so they stay pixel-identical. A row with `children` renders as a
// submenu parent (trailing ▸, opens on hover/click) instead of a leaf.
function MenuRow({
  item,
  onLeafSelect,
  isOpen,
  onOpenSubmenu,
  onLeaveParent,
}: {
  item: ContextMenuItem
  onLeafSelect: () => void
  isOpen?: boolean
  onOpenSubmenu?: (rect: DOMRect) => void
  /** Mouse left this submenu-parent row — schedules the flyout's close (grace period lets the pointer cross into it first). */
  onLeaveParent?: () => void
}) {
  const hasChildren = !!item.children
  return (
    <Frame
      as="button"
      disabled={item.disabled}
      onMouseEnter={hasChildren ? (e) => onOpenSubmenu?.((e.currentTarget as HTMLElement).getBoundingClientRect()) : undefined}
      onMouseLeave={hasChildren ? () => onLeaveParent?.() : undefined}
      onClick={(e) => {
        if (item.disabled) return
        if (hasChildren) {
          // Parent row: (re)open its flyout, never close the menu.
          onOpenSubmenu?.((e.currentTarget as HTMLElement).getBoundingClientRect())
          return
        }
        onLeafSelect()
      }}
      flow="horizontal"
      align="center"
      justify="between"
      w="fill"
      minH={ROW_H}
      variant="none"
      hoverFill={item.disabled ? undefined : 'bg-3'}
      // Only the open submenu parent carries a persistent fill; leaving every
      // other row's base fill unset lets `hoverFill` actually paint on hover
      // (an explicit transparent base fill would sit over it and swallow it).
      // The open parent's fill matches the hover colour, so a row that opens a
      // second dropdown reads exactly like a plain hovered row.
      fill={isOpen ? { solid: 'bg-3' } : undefined}
      radius={0}
      padding={{ x: 10, y: 6 }}
      cursor={item.disabled ? 'default' : 'pointer'}
      gap={8}
      textColor={item.disabled ? 'var(--text-3)' : item.destructive ? '#e07a7a' : 'var(--text-2)'}
      style={{ textAlign: 'left', fontSize: 11, letterSpacing: '0.02em', opacity: item.disabled ? 0.5 : 1, ...MONO }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {item.icon && <Icon name={item.icon} size={13} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
      </span>
      {hasChildren && <span style={{ opacity: 0.7, flexShrink: 0 }}>▸</span>}
    </Frame>
  )
}

// A minimal right-click menu, styled to match LeftRailingView's own
// hand-rolled sort-order popup rather than the Dropdown/Text component
// system — this is meant to sit inside that same dark, MONO-styled file
// tree. Unlike Dropdown, it anchors at a raw {x,y} viewport point (wherever
// the click landed) instead of a trigger element's bounding rect.
export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose, anchorEl }) => {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  // The open submenu, if any: which parent index and the on-screen rect of its
  // row (so the flyout can sit flush to its right/left edge).
  const [submenu, setSubmenu] = useState<{ index: number; rect: DOMRect } | null>(null)
  // Hover-intent: the flyout opens while the pointer is over the parent row or
  // the flyout itself, and closes shortly after it leaves both — the short
  // grace delay lets the pointer travel across the seam between them without
  // the flyout flickering shut.
  const closeTimer = useRef<number | null>(null)
  const cancelClose = () => {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setSubmenu(null), 160)
  }
  useEffect(() => () => cancelClose(), [])

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

  const openItem = submenu ? items[submenu.index] : null
  // Flyout side/coords from the parent row's rect: open right if it fits, else
  // flip left. Positioned with `fixed` (viewport coords) in the same portal, so
  // it escapes the parent menu's `clipContent` overflow clip.
  let flyX = 0
  let flyY = 0
  if (submenu) {
    const openLeft = submenu.rect.right + SUBMENU_W > window.innerWidth
    flyX = openLeft ? submenu.rect.left - SUBMENU_W + 2 : submenu.rect.right - 2
    const childCount = openItem?.children?.length ?? 0
    const flyH = Math.min(childCount * ROW_H + 8, 260)
    flyY = Math.max(8, Math.min(submenu.rect.top - 1, window.innerHeight - flyH - 8))
  }

  return ReactDOM.createPortal(
    <>
      <Frame
        fixed
        x={x}
        y={y}
        z={1000}
        flow="vertical"
        gap={0}
        padding={0}
        w={MENU_W}
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
            <MenuRow
              item={item}
              isOpen={submenu?.index === i}
              onLeafSelect={() => {
                item.onSelect?.()
                onClose()
              }}
              onOpenSubmenu={(rect) => {
                cancelClose()
                setSubmenu((prev) => (prev?.index === i ? prev : { index: i, rect }))
              }}
              onLeaveParent={scheduleClose}
            />
          </React.Fragment>
        ))}
      </Frame>

      {submenu && openItem?.children && (
        <Frame
          data-floating-menu
          fixed
          x={flyX}
          y={flyY}
          z={1001}
          flow="vertical"
          gap={0}
          padding={0}
          w={SUBMENU_W}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          fill={{ solid: 'bg-2' }}
          stroke={{ color: 'var(--border-2)' }}
          radius="var(--radius-control)"
          scroll="y"
          style={{ maxHeight: 260, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}
        >
          {openItem.children.map((child, ci) => (
            <MenuRow
              key={ci}
              item={child}
              onLeafSelect={() => {
                child.onSelect?.()
                onClose()
              }}
            />
          ))}
        </Frame>
      )}
    </>,
    portalTarget,
  )
}
