import React from 'react'
import { Icon } from '../Icon/Icon'

// The shared Planning node mark as a drop-in glyph for list rows (a "node list
// item"), so a node reads identically whether it's a dot on the graph canvas or
// an iconStart in a list. It reuses the very same two icons the canvas stamps
// (Icon's plan-node / plan-node-plain, drawn from NODE_LINKED_PATH /
// NODE_PLAIN_PATH) — a node WITH a connection line when it's linked, a plain
// ring when it isn't — so the two never drift.
export interface NodeGlyphProps {
  /** Linked nodes (have borrows/plan-step edges) draw the with-line glyph; unlinked ones draw the plain ring. */
  linked?: boolean
  /** Glyph size in px. Defaults to 14 — the list-row icon size. */
  size?: number
  className?: string
}

export const NodeGlyph: React.FC<NodeGlyphProps> = ({ linked = false, size = 14, className }) => (
  <Icon name={linked ? 'plan-node' : 'plan-node-plain'} size={size} className={className} />
)
