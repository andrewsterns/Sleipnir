import React, { useState, type ReactNode, type CSSProperties, type MouseEvent } from 'react'

// The one selectable-row primitive for every scroll list in the app (the file
// trees, Planning's node/plan lists, Git's changed files). It owns the layout
// so rows can't drift apart: a left-aligned [leading][label][trailing] flex
// line at a fixed height, the shared `.srow` hover/selection states (see
// item-states.css), and one-line ellipsised labels whose colour flips with the
// row state. Each surface only supplies its own leading (icon/chevron/glyphs)
// and trailing (status/actions) content.
export interface ListRowProps {
  /** Solid "you are here" fill — item-states.css `.is-selected`. */
  selected?: boolean
  /** Outline highlight without the solid fill — item-states.css `.is-connected`. */
  connected?: boolean
  /**
   * Left padding in px — the tree-depth indent, the sidebar's base inset, etc.
   * Defaults to 8. (Right padding is a fixed 8; override via `style` if needed.)
   */
  indent?: number
  /** Fixed content before the label: icon, chevron, checkbox, status glyphs. */
  leading?: ReactNode
  /**
   * The row's type mark, sitting between `leading` and the label — a workspace
   * folder/file icon, a plan glyph, a NodeGlyph for a node row, etc. Split out
   * from `leading` (which stays for chevrons/checkboxes) so every list reads
   * with the same [control][type-icon][label] rhythm. Dims with the label.
   */
  iconStart?: ReactNode
  /**
   * Content after the label. Pass a function to receive the row's live hover
   * state — the common "status label at rest, action buttons on hover" swap.
   */
  trailing?: ReactNode | ((hovered: boolean) => ReactNode)
  /**
   * Dims the leading + label together (never the selection fill or trailing) —
   * for de-emphasis tiers like a file tree's open/new/old brightness. 0..1.
   */
  labelOpacity?: number
  onClick?: (e: MouseEvent) => void
  onDoubleClick?: (e: MouseEvent) => void
  onContextMenu?: (e: MouseEvent) => void
  onMouseEnter?: (e: MouseEvent) => void
  onMouseLeave?: (e: MouseEvent) => void
  title?: string
  className?: string
  style?: CSSProperties
  /** The label — kept to a single ellipsised line. Usually text, but any node. */
  children: ReactNode
}

// Shared so every list reads at the same height/rhythm.
export const LIST_ROW_MIN_H = 28
const ROW_GAP = 6

export const ListRow: React.FC<ListRowProps> = ({
  selected,
  connected,
  indent = 8,
  leading,
  iconStart,
  trailing,
  labelOpacity = 1,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  title,
  className,
  style,
  children,
}) => {
  const [hovered, setHovered] = useState(false)
  const cls = ['srow', selected && 'is-selected', connected && 'is-connected', className]
    .filter(Boolean)
    .join(' ')
  // A de-emphasised row (labelOpacity < 1) brightens to full on hover — the
  // universal "reach for it and it comes forward" behaviour the file tree's
  // open/new/old tiers relied on.
  const contentOpacity = hovered ? 1 : labelOpacity

  return (
    <div
      className={cls}
      title={title}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={(e) => { setHovered(true); onMouseEnter?.(e) }}
      onMouseLeave={(e) => { setHovered(false); onMouseLeave?.(e) }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: ROW_GAP,
        // stretch (not width:100%) so full-bleed rows — those pulled past the
        // panel padding with negative margins — actually reach the far edge;
        // an explicit width can't grow into a negative margin.
        alignSelf: 'stretch',
        minHeight: LIST_ROW_MIN_H,
        paddingLeft: indent,
        paddingRight: 8,
        cursor: onClick ? 'pointer' : undefined,
        fontSize: 12,
        letterSpacing: '0.02em',
        fontFamily: 'var(--font-mono)',
        ...style,
      }}
    >
      {leading != null && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: ROW_GAP, flexShrink: 0, opacity: contentOpacity }}>
          {leading}
        </span>
      )}
      {iconStart != null && (
        <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, opacity: contentOpacity }}>
          {iconStart}
        </span>
      )}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'inherit',
          opacity: contentOpacity,
        }}
      >
        {children}
      </span>
      {typeof trailing === 'function' ? trailing(hovered) : trailing}
    </div>
  )
}
