import React from 'react'
import { Frame, FrameProps } from '../Frame/Frame'
import { Text } from '../Text/Text'
import { cn } from '../../../utils/cn'

// Omit Frame props that Button remaps to its own types
export interface ButtonProps extends Omit<FrameProps, 'variant' | 'size'> {
  /**
   * Visual style. Maps to Frame's variant + adds stroke/hover extras for outline/ghost.
   * @default 'primary'
   */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'none'
  /**
   * Size preset — controls padding and text scale.
   * Pass `padding` directly to override.
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  disabled?: boolean
}

const FRAME_VARIANT: Record<string, 'primary' | 'secondary' | 'none'> = {
  primary: 'primary', secondary: 'secondary',
  outline: 'none', ghost: 'none', none: 'none',
}

const VARIANT_EXTRAS: Record<string, Partial<FrameProps>> = {
  outline: { textColor: 'var(--text-1)', hoverFill: 'bg-2', stroke: { color: 'border-1' } },
  // ghost carries no inline colour/hover — it wears the shared `.srow` list-row
  // language instead (see VARIANT_CLASS): 80% ink at rest, an inset ink outline
  // + full-ink text on hover, no background wash. Keeps quiet buttons reading
  // exactly like ListRows and graph node labels.
  ghost:   {},
}

// Class-based extras, for variants that reuse a shared stylesheet language
// rather than Frame's inline hover props (item-states.css `.srow`).
const VARIANT_CLASS: Record<string, string | undefined> = {
  ghost: 'srow',
}

const SIZE_PADDING = {
  sm: { x: 10, y: 5 },
  md: { x: 12, y: 7 },
  lg: { x: 16, y: 9 },
} as const

// Match the list-row type scale (ListRow renders 12px mono @ 0.02em) — a step
// down from the old uppercase button sizing, so buttons sit in the same
// typographic rhythm as every list in the app.
const SIZE_TEXT_PX = { sm: 12, md: 13, lg: 15 } as const

export const Button = React.forwardRef<HTMLElement, ButtonProps>((
  {
    // ── Button-specific ───────────────────────────────────────────────────────
    variant = 'primary',
    size    = 'md',
    isLoading,
    disabled,
    children,

    // ── Frame defaults — callers can override any of these ───────────────────
    as              = 'button',
    layout          = 'inline-flex',
    flow            = 'horizontal',
    align           = 'center',
    justify         = 'center',
    // Buttons read pill-ish at --radius-control (0.7rem) because they're short;
    // the squarer --radius-4 matches the IconButtons that sit beside them (and
    // the search row) instead of over-rounding.
    radius          = 'var(--radius-4)',
    transition      = 'all',
    focusRing       = true,
    activeScale     = 0.98,
    disabledOpacity      = true,
    disabledPointerEvents = true,
    // Intercept padding so we can fallback to size-based default
    padding,
    // Intercept className so a variant's own class composes with the caller's
    className,

    // ── Everything else passes straight through to Frame ─────────────────────
    ...frameProps
  },
  ref
) => (
  <Frame
    as={as}
    ref={ref}
    disabled={disabled || isLoading}
    variant={FRAME_VARIANT[variant]}
    layout={layout}
    flow={flow}
    align={align}
    justify={justify}
    radius={radius}
    padding={padding ?? SIZE_PADDING[size]}
    transition={transition}
    focusRing={focusRing}
    activeScale={activeScale}
    disabledOpacity={disabledOpacity}
    disabledPointerEvents={disabledPointerEvents}
    className={cn(VARIANT_CLASS[variant], className)}
    {...VARIANT_EXTRAS[variant]}
    {...frameProps}
  >
    {isLoading && (
      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
    )}
    <Text
      size={SIZE_TEXT_PX[size]}
      mono
      weight="medium"
      tracking="0.02em"
      leading="none"
    >
      {children}
    </Text>
  </Frame>
))

Button.displayName = 'Button'
