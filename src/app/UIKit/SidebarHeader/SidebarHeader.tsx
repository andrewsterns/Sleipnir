import React from 'react'
import { Frame } from '../Frame/Frame'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.12em',
  color: 'var(--text-2)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  ...MONO,
}

export interface SidebarHeaderProps {
  /** Shown uppercase, small, letter-spaced — e.g. a folder's root label (LeftRailing) or a category name (Planning). Callers pass it already-cased; this component doesn't force-uppercase so a caller can mix case if it ever needs to (e.g. a plan count baked into the string). */
  label: string
  /** Right-aligned icon-button cluster — e.g. LeftRailing's sort/new-file-or-folder buttons. Omit for a bare label row. In search mode (see `search`) these relocate to a second row beneath the input, so the input has the full width to itself. */
  actions?: React.ReactNode
  /** When true, the header swaps to search mode: `search` takes over the title row (covering the label) and `actions` drop to a row beneath it. Caller owns this flag so it can also drive autofocus/click-away. */
  searchOpen?: boolean
  /** The inline search control shown in place of the label while `searchOpen`. Pass a `w="fill"` <Search/> — its own filter/clear affordances ride along inside it, so they stay put on the right where they were. */
  search?: React.ReactNode
}

// The "label on the left, action icons on the right" row shared by every
// sidebar-style panel — LeftRailing's own root-folder header (Workspace,
// Research) and Planning's top-level title above its search box. One
// component so the two stay pixel-identical instead of two hand-rolled
// copies drifting apart.
//
// Clicking a caller's search trigger flips `searchOpen`: the search input
// slides over where the title was (title hidden, not pushed down), and the
// action icons that shared the row drop to a second row beneath so the input
// owns the full width. Collapsing search restores the single title row.
export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ label, actions, searchOpen, search }) => {
  if (searchOpen && search) {
    return (
      <Frame flow="vertical" gap={8} shrink={0}>
        {search}
        {actions && (
          <Frame flow="horizontal" align="center" justify="end" gap={2} shrink={0}>
            {actions}
          </Frame>
        )}
      </Frame>
    )
  }

  return (
    <Frame flow="horizontal" align="center" justify="between" shrink={0}>
      <span style={LABEL_STYLE}>{label}</span>
      {actions}
    </Frame>
  )
}
