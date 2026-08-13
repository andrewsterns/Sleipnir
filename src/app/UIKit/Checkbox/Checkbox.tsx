import React from 'react'
import { Frame } from '../Frame/Frame'

// The one checkbox primitive for the whole app (Git's stage toggle, the
// Workspace-plan directory picker, and anything new). Built on Frame so it
// inherits theme tokens, focus ring, press feedback and disabled handling.
//
// It draws with `currentColor` — border at rest, a filled box when checked —
// so it flips with whatever ink its row is using (e.g. ground-on-fill inside a
// selected ListRow, ink when idle), exactly like the hand-rolled square it
// replaces. Smaller (12px) and slightly rounded, per the shared design.
export interface CheckboxProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  /** Renders the "some but not all" dash instead of the filled box. */
  indeterminate?: boolean
  title?: string
  /** Box size preset. Default 'sm' (12px). */
  size?: 'sm' | 'md'
  /**
   * Stop the click from bubbling — set when the checkbox sits inside a larger
   * clickable row (a ListRow, a label) that has its own onClick, so ticking the
   * box doesn't also fire the row.
   */
  stopPropagation?: boolean
  className?: string
  style?: React.CSSProperties
}

const BOX = { sm: 12, md: 14 } as const

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  disabled,
  indeterminate,
  title,
  size = 'sm',
  stopPropagation,
  className,
  style,
}) => {
  const dim = BOX[size]
  const filled = checked && !indeterminate
  return (
    <Frame
      as="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      disabled={disabled}
      title={title}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation()
        if (disabled) return
        onChange?.(!checked)
      }}
      layout="inline-flex"
      align="center"
      justify="center"
      w={dim}
      h={dim}
      shrink={0}
      radius={3}
      transition="all"
      focusRing
      activeScale={0.95}
      disabledOpacity
      disabledPointerEvents
      className={className}
      // eslint-disable-next-line no-restricted-syntax -- currentColor border/fill flip has no Frame prop; same pattern as the ListRow status glyphs.
      style={{
        border: '1px solid currentColor',
        background: filled ? 'currentColor' : 'transparent',
        opacity: disabled ? 0.5 : 0.85,
        cursor: disabled ? 'default' : 'pointer',
        padding: 0,
        ...style,
      }}
    >
      {indeterminate && (
        <span style={{ width: dim - 6, height: 2, background: 'currentColor', borderRadius: 1 }} />
      )}
    </Frame>
  )
}
