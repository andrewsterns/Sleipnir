// The smallest CSS building blocks the canvas uses — a style bag type and how
// a color reference becomes a CSS value. A leaf on purpose: toCss.ts and
// paint.ts both build on it, and neither has to import the other for it.

import type { ColorRef } from './types'

/** A plain CSS property bag — the shape React's `style` prop takes. */
export type CssProps = Record<string, string | number>

/**
 * A token id ('bg-2') becomes var(--bg-2); anything that already looks like a
 * literal color or CSS function is passed through untouched.
 */
export function cssColor(ref: ColorRef): string {
  const value = ref.trim()
  if (!value) return 'transparent'
  if (value.startsWith('#') || value.includes('(') || value.startsWith('var(')) return value
  if (value === 'transparent' || value === 'currentColor' || value === 'inherit') return value
  return `var(--${value})`
}
