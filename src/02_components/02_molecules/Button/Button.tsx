import React from 'react'
import { Frame, FrameProps } from '../../01_atoms/Frame/Frame'
import { Text } from '../../01_atoms/Text/Text'

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
  ghost:   { textColor: 'var(--text-1)', hoverFill: 'bg-2' },
}

const SIZE_PADDING = {
  sm: { x: '0.75rem', y: '0.375rem' },
  md: { x: '1rem',    y: '0.5rem'   },
  lg: { x: '1.5rem',  y: '0.75rem'  },
} as const

const SIZE_TEXT = { sm: 'small', md: 'p', lg: 'h6' } as const

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
    radius          = 'var(--radius-3)',
    transition      = 'all',
    focusRing       = true,
    activeScale     = 0.98,
    disabledOpacity      = true,
    disabledPointerEvents = true,
    // Intercept padding so we can fallback to size-based default
    padding,

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
    {...VARIANT_EXTRAS[variant]}
    {...frameProps}
  >
    {isLoading && (
      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
    )}
    <Text
      variant={SIZE_TEXT[size]}
      weight="medium"
      italic
      transform="uppercase"
      tracking="tight"
      leading="none"
    >
      {children}
    </Text>
  </Frame>
))

Button.displayName = 'Button'
