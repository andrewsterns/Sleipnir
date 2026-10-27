// The properties panel's shared field primitives — labels, sections, number
// inputs — used by CanvasInspector and its paint sections (PaintSections.tsx).

import { useRef, useState } from 'react'
import { Frame } from '../../app/UIKit/Frame/Frame'
import { useScrub } from './useScrub'

export const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export const FIELD: React.CSSProperties = {
  ...MONO,
  background: 'var(--bg-2)',
  border: '1px solid var(--border-1)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-1)',
  fontSize: 10,
  padding: '4px 6px',
  outline: 'none',
  width: '100%',
  minWidth: 0,
}

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

export function Label({ children, style, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...rest} style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.08em', ...style }}>{children}</span>
  )
}

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

/**
 * A number input that also scrubs: drag it (or its label) sideways to change
 * the value, click it to type — see useScrub.
 */
export function NumberField({
  label,
  value,
  onChange,
  disabled,
  min,
  max,
  step,
  suffix,
}: {
  label?: string
  value: number | undefined
  onChange: (n: number) => void
  disabled?: boolean
  min?: number
  max?: number
  /** Change per pixel when scrubbing. @default 1 */
  step?: number
  /** Shown inside the field's right edge — '%', '°'. */
  suffix?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const scrub = useScrub({ value, onChange, min, max, step, disabled, inputRef })
  const scrubCursor = disabled ? undefined : 'ew-resize'
  return (
    <Frame flow="vertical" gap={2} grow style={{ minWidth: 0 }}>
      {label && (
        <Label {...scrub} style={{ cursor: scrubCursor, userSelect: 'none', alignSelf: 'flex-start' }}>
          {label}
        </Label>
      )}
      <div style={{ position: 'relative', minWidth: 0 }}>
        <input
          ref={inputRef}
          type="number"
          className="scrub-field"
          disabled={disabled}
          value={value ?? ''}
          min={min}
          max={max}
          {...scrub}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (e.target.value === '' || Number.isNaN(n)) return
            onChange(min !== undefined || max !== undefined ? Math.min(max ?? n, Math.max(min ?? n, n)) : n)
          }}
          style={{ ...FIELD, opacity: disabled ? 0.4 : 1, paddingRight: suffix ? 16 : 6, cursor: focused ? 'text' : scrubCursor }}
        />
        {suffix && (
          <span
            style={{
              ...MONO,
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 9,
              color: 'var(--text-3)',
              pointerEvents: 'none',
            }}
          >
            {suffix}
          </span>
        )}
      </div>
    </Frame>
  )
}
