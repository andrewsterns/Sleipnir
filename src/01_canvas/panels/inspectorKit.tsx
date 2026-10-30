// The properties panel's shared field primitives — labels, sections, number
// inputs — used by CanvasInspector and its paint sections (PaintSections.tsx).

import { Frame } from '../../app/UIKit/Frame/Frame'
import { FieldLabel } from '../../app/UIKit/Field/TextField'
import { NumberField } from '../../app/UIKit/Field/NumberField'
import { fieldStyle } from '../../app/UIKit/Field/fieldStyle'

export const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

/** The shared field look (UIKit/Field), at the panel's dense size. */
export const FIELD: React.CSSProperties = fieldStyle('sm')

// Shared look for the stacked, full-width buttons at the bottom of the
// component section. Call sites layer their own color/opacity/cursor on top for
// the enabled-vs-disabled and destructive cases.
export const ACTION: React.CSSProperties = {
  ...MONO,
  fontSize: 9,
  letterSpacing: '0.08em',
  textAlign: 'center',
  width: '100%',
  background: 'var(--bg-2)',
  border: '1px solid var(--border-1)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-2)',
  padding: '5px 8px',
  cursor: 'pointer',
}

/** A small square icon-ish button: add, remove, the eye toggle. */
export const ICON_BUTTON: React.CSSProperties = {
  ...MONO,
  fontSize: 11,
  lineHeight: 1,
  width: 20,
  height: 20,
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-2)',
  cursor: 'pointer',
  padding: 0,
}

/** A field's small caps label — UIKit's FieldLabel. */
export const Label = FieldLabel

export function Section({
  title,
  action,
  children,
}: {
  title: string
  /** Rendered at the right of the title row — a section's "+" button. */
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <Frame flow="vertical" gap={6} w="fill" padding={{ top: 10, bottom: 10, left: 10, right: 10 }}
      stroke={{ bottom: { color: 'border-1' } }}>
      <Frame flow="horizontal" align="center" justify="between" w="fill">
        <Label>{title}</Label>
        {action}
      </Frame>
      {children}
    </Frame>
  )
}

/** The app's counter, with drag-to-scrub — lives in UIKit/Field so every screen shares it. */
export { NumberField }
