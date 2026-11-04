import React from 'react'
import { Frame, type FrameProps } from '../Frame/Frame'
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
  outline: { textColor: 'var(--text-1)', hoverFill: 'bg-3', stroke: { color: 'border-2' } },
  // ghost: no fill at rest, a soft ink wash on hover (see VARIANT_CLASS).
  ghost:   { textColor: 'var(--text-2)' },
}

// Class-based extras, for variants whose hover lives in a stylesheet rather
// than Frame's inline hover props (index.css `.btn-*`).
const VARIANT_CLASS: Record<string, string | undefined> = {
  primary:   'btn-primary',
  secondary: 'btn-secondary',
  ghost:     'btn-ghost',
}

const SIZE_PADDING = {
  sm: { x: 12, y: 6 },
  md: { x: 14, y: 8 },
  lg: { x: 18, y: 10 },
} as const

// The list-row type scale (ListRow renders 13px) — buttons sit in the same
// typographic rhythm as every list in the app.
const SIZE_TEXT_PX = { sm: 12.5, md: 13, lg: 15 } as const

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
    // One corner for every control: buttons, fields, search and IconButtons.
    radius          = 'var(--radius-control)',
    transition      = 'colors',
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
      weight="medium"
      tracking="-0.005em"
      leading="none"
    >
      {children}
    </Text>
  </Frame>
))

Button.displayName = 'Button'
