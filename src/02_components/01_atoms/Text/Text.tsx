import React from 'react';
import { cn } from '../../../utils/cn';

export type TextVariant = 
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' 
  | 'p' | 'small' | 'xs' | 'link' | 'li';

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  variant?: TextVariant;
  as?: React.ElementType;
  weight?: 'light' | 'normal' | 'medium' | 'bold' | 'black';
  italic?: boolean;
  color?: 'text-0' | 'text-1' | 'text-2' | 'text-3' | 'accent' | 'inherit';
  align?: 'left' | 'center' | 'right' | 'justify';
  noWrap?: boolean;
  underline?: boolean;
  transform?: 'uppercase' | 'lowercase' | 'capitalize' | 'normal-case';
  tracking?: 'tighter' | 'tight' | 'normal' | 'wide' | 'wider' | 'widest';
  leading?: 'none' | 'tight' | 'snug' | 'normal' | 'relaxed' | 'loose';
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

  const weightClasses = {
    light: 'font-[var(--weight-light)]',
    normal: 'font-[var(--weight-normal)]',
    medium: 'font-[var(--weight-medium)]',
    bold: 'font-[var(--weight-bold)]',
    black: 'font-[var(--weight-black)]', // Host Grotesque black often looks better italicized in this theme
  };

  const colorClasses = {
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

  const trackingClasses = {
    tighter: 'tracking-tighter',
    tight:   'tracking-tight',
    normal:  'tracking-normal',
    wide:    'tracking-wide',
    wider:   'tracking-wider',
    widest:  'tracking-widest',
  };

  const leadingClasses = {
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
      {...(href ? { href } : {})}
      {...props}
    >
      {children}
    </Component>
  );
};
