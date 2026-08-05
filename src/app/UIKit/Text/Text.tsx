import React from 'react';
import { cn } from '../../../utils/cn';
import { resolveToken } from '../Frame/FrameViewModel';

export type TextVariant =
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'p' | 'small' | 'xs' | 'link' | 'li';

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  variant?: TextVariant;
  as?: React.ElementType;
  /** Exact font size (px number or CSS string). Wins over the variant scale. */
  size?: number | string;
  /** Render in the mono/terminal font (var(--font-mono)). */
  mono?: boolean;
  weight?: 'light' | 'normal' | 'medium' | 'semibold' | 'bold' | 'black';
  italic?: boolean;
  /** Preset token, or any color token / CSS color (e.g. 'scan', 'var(--critical)', '#fff'). */
  color?: 'text-0' | 'text-1' | 'text-2' | 'text-3' | 'accent' | 'inherit' | (string & {});
  align?: 'left' | 'center' | 'right' | 'justify';
  noWrap?: boolean;
  underline?: boolean;
  transform?: 'uppercase' | 'lowercase' | 'capitalize' | 'normal-case';
  /** Preset, or any CSS letter-spacing value (e.g. '0.14em'). */
  tracking?: 'tighter' | 'tight' | 'normal' | 'wide' | 'wider' | 'widest' | (string & {});
  /** Preset, or any CSS line-height value (e.g. '16px', 1.4). */
  leading?: 'none' | 'tight' | 'snug' | 'normal' | 'relaxed' | 'loose' | (string & {});
  children: React.ReactNode;
  href?: string; // For link variant
}

/**
 * Modular Text Component
 * Built on Host Grotesque with semantic scaling.
 */
export const Text: React.FC<TextProps> = ({
  variant = 'p',
  as,
  size,
  mono = false,
  weight,
  italic = false,
  color = 'inherit',
  align,
  noWrap = false,
  underline = false,
  transform,
  tracking,
  leading,
  children,
  className,
  href,
  style,
  ...props
}) => {
  // Determine the HTML element to use
  const Component = as || (
    variant === 'link' ? 'a' :
    variant === 'li' ? 'li' :
    (variant.startsWith('h') ? variant : 'p')
  ) as React.ElementType;

  const variantClasses: Record<TextVariant, string> = {
    h1: 'text-[var(--font-h1)] leading-[var(--leading-tight)] tracking-tighter',
    h2: 'text-[var(--font-h2)] leading-[var(--leading-tight)] tracking-tighter',
    h3: 'text-[var(--font-h3)] leading-[var(--leading-tight)] tracking-tight',
    h4: 'text-[var(--font-h4)] leading-[var(--leading-normal)]',
    h5: 'text-[var(--font-h5)] leading-[var(--leading-normal)]',
    h6: 'text-[var(--font-h6)] leading-[var(--leading-normal)]',
    p: 'text-[var(--font-p)] leading-[var(--leading-normal)]',
    small: 'text-[var(--font-small)] leading-[var(--leading-normal)]',
    xs: 'text-[var(--font-xs)] leading-[var(--leading-normal)] uppercase tracking-widest',
    link: 'text-[var(--font-p)] leading-[var(--leading-normal)] hover:text-[var(--accent-1)] transition-colors cursor-pointer underline-offset-4',
    li: 'text-[var(--font-p)] leading-[var(--leading-normal)] list-disc ml-4',
  };

  const weightClasses: Record<NonNullable<TextProps['weight']>, string> = {
    light: 'font-[var(--weight-light)]',
    normal: 'font-[var(--weight-normal)]',
    medium: 'font-[var(--weight-medium)]',
    semibold: 'font-semibold', // no --weight-semibold theme token; static 600
    bold: 'font-[var(--weight-bold)]',
    black: 'font-[var(--weight-black)]', // Host Grotesque black often looks better italicized in this theme
  };

  const colorClasses: Record<string, string> = {
    'text-0': 'text-[var(--text-0)]',
    'text-1': 'text-[var(--text-1)]',
    'text-2': 'text-[var(--text-2)]',
    'text-3': 'text-[var(--text-3)]',
    'accent': 'text-[var(--accent-1)]',
    'inherit': '',
  };

  const alignmentClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
    justify: 'text-justify',
  };

  const trackingClasses: Record<string, string> = {
    tighter: 'tracking-tighter',
    tight:   'tracking-tight',
    normal:  'tracking-normal',
    wide:    'tracking-wide',
    wider:   'tracking-wider',
    widest:  'tracking-widest',
  };

  const leadingClasses: Record<string, string> = {
    none:    'leading-none',
    tight:   'leading-tight',
    snug:    'leading-snug',
    normal:  'leading-normal',
    relaxed: 'leading-relaxed',
    loose:   'leading-loose',
  };

  // Default weights for variants if not provided
  const defaultWeight = weight || (
    variant.startsWith('h') ? (variant === 'h1' || variant === 'h2' ? 'black' : 'bold') : 'normal'
  );

  // Non-preset values resolve to inline CSS (Tailwind JIT can't see runtime
  // classes); presets keep their static class path. Caller style wins last.
  const computedStyle: React.CSSProperties = {};
  if (size !== undefined) computedStyle.fontSize = size;
  if (mono) computedStyle.fontFamily = 'var(--font-mono)';
  if (!(color in colorClasses)) computedStyle.color = resolveToken(color);
  if (tracking && !(tracking in trackingClasses)) computedStyle.letterSpacing = tracking;
  if (leading && !(leading in leadingClasses)) computedStyle.lineHeight = leading;
  const mergedStyle = { ...computedStyle, ...style };

  return (
    <Component
      className={cn(
        variantClasses[variant],
        weightClasses[defaultWeight],
        colorClasses[color],
        align && alignmentClasses[align],
        italic && 'italic',
        underline && 'underline',
        noWrap && 'whitespace-nowrap truncate',
        transform && transform,
        tracking && trackingClasses[tracking],
        leading && leadingClasses[leading],
        className
      )}
      style={mergedStyle}
      {...(href ? { href } : {})}
      {...props}
    >
      {children}
    </Component>
  );
};
