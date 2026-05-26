import React from 'react';
import { Frame, FrameProps } from '../../01_atoms/Frame/Frame';
import { Text } from '../../01_atoms/Text/Text';

export interface ButtonProps extends Omit<FrameProps, 'variant'> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'none';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  disabled?: boolean;
  text?: string;
  id?: string;
}

/**
 * Atomic Button
 * Built on top of the Frame component for consistent styling and theming.
 */
export const Button = React.forwardRef<HTMLElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, theme, children, disabled, ...props }, ref) => {

    const frameVariant = { primary: 'primary', secondary: 'secondary', outline: 'none', ghost: 'none', none: 'none' } as const;

    const variantExtraMap: Record<string, Partial<React.ComponentProps<typeof Frame>>> = {
      outline: { textColor: 'var(--text-1)', hoverFill: 'bg-2' as const, border: 'var(--border-w) solid var(--border-1)' },
      ghost:   { textColor: 'var(--text-1)', hoverFill: 'bg-2' as const },
    };
    const variantExtra = variantExtraMap[variant] ?? {};

    const paddingMap = {
      sm: { x: '0.75rem', y: '0.375rem' },
      md: { x: '1rem',    y: '0.5rem'   },
      lg: { x: '1.5rem',  y: '0.75rem'  },
    };

    const typographyVariant = { sm: 'small', md: 'p', lg: 'h6' } as const;

    return (
      <Frame
        as="button"
        ref={ref as any}
        disabled={disabled || isLoading}
        variant={frameVariant[variant]}
        theme={theme}
        layout="inline-flex"
        align="center"
        justify="center"
        borderRadius="var(--radius-3, var(--radius-1, 6px))"
        padding={paddingMap[size]}
        transition="all"
        focusRing
        activeScale={0.98}
        disabledOpacity
        disabledPointerEvents
        className={className}
        {...variantExtra}
        {...props as any}
      >
        {isLoading ? (
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : null}
        <Text variant={typographyVariant[size]} weight="medium" italic transform="uppercase" tracking="tight" leading="none">
          {children}
        </Text>
      </Frame>
    );
  }
);

Button.displayName = 'Button';
