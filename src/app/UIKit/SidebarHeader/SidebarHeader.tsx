import React from 'react'
import { Frame } from '../Frame/Frame'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface SidebarHeaderProps {
  /** Shown uppercase, small, letter-spaced — e.g. a folder's root label (LeftRailing) or a category name (Planning). Callers pass it already-cased; this component doesn't force-uppercase so a caller can mix case if it ever needs to (e.g. a plan count baked into the string). */
  label: string
  /** Right-aligned icon-button cluster — e.g. LeftRailing's sort/new-file-or-folder buttons. Omit for a bare label row. */
  actions?: React.ReactNode
}

// The "label on the left, action icons on the right" row shared by every
// sidebar-style panel — LeftRailing's own root-folder header (Workspace,
// Research) and Planning's top-level title above its search box. One
// component so the two stay pixel-identical instead of two hand-rolled
// copies drifting apart.
export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ label, actions }) => (
  <Frame flow="horizontal" align="center" justify="between" shrink={0}>
    <span
      style={{
        fontSize: 11,
        letterSpacing: '0.12em',
        color: 'var(--text-2)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...MONO,
      }}
    >
      {label}
    </span>
    {actions}
  </Frame>
)
