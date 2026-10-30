import { useRef, useState } from 'react'
import { FIELD_CLASS, fieldStyle, type FieldSize } from './fieldStyle'
import { FieldLabel } from './TextField'
import { useScrub } from './useScrub'

/**
 * The app's counter: a number input that also scrubs — drag it (or its label)
 * sideways to change the value, click it to type. See useScrub for the drag
 * (pointer lock, edge wraparound, Shift/Alt/Esc).
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
  size = 'sm',
  title,
}: {
  label?: string
  value: number | undefined
  onChange: (n: number) => void
  disabled?: boolean
  min?: number
  max?: number
  /** Change per pixel when scrubbing. @default 1 */
  step?: number
  /** Shown inside the field's right edge — '%', '°', 'px'. */
  suffix?: string
  /** The properties panel is 'sm' (the default); settings pages use 'lg'. */
  size?: FieldSize
  title?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const scrub = useScrub({ value, onChange, min, max, step, disabled, inputRef })
  const scrubCursor = disabled ? undefined : 'ew-resize'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }} title={title}>
      {label && (
        <FieldLabel {...scrub} style={{ cursor: scrubCursor, userSelect: 'none', alignSelf: 'flex-start' }}>
          {label}
        </FieldLabel>
      )}
      <div style={{ position: 'relative', minWidth: 0 }}>
        <input
          ref={inputRef}
          type="number"
          className={`${FIELD_CLASS} scrub-field`}
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
          style={{ ...fieldStyle(size), paddingRight: suffix ? 16 : undefined, cursor: focused ? 'text' : scrubCursor }}
        />
        {suffix && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
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
    </div>
  )
}
