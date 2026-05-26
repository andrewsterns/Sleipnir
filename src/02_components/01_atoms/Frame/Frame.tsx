import React, { useMemo, forwardRef, useEffect, useRef, useCallback } from 'react';
import { cn } from '../../../utils/cn';
import { Theme } from '../../00_themes';

export type LayoutType = 'flex' | 'grid' | 'block' | 'inline-block' | 'inline-flex' | 'inline-grid' | 'none';
export type AlignmentType = 'start' | 'center' | 'end' | 'baseline' | 'stretch';
export type JustifyType = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
export type SpacingValue = string | number;

export type SpacingProp = SpacingValue | {
  top?: SpacingValue;
  right?: SpacingValue;
  bottom?: SpacingValue;
  left?: SpacingValue;
  x?: SpacingValue;
  y?: SpacingValue;
};

export interface ShadowProps {
  x?: number | string;
  y?: number | string;
  blur?: number | string;
  spread?: number | string;
  color?: string;
  inset?: boolean;
}

export interface BorderSideProps {
  width?: number | string;
  style?: string;
  color?: string;
}

export interface BorderProps {
  width?: number | string;
  style?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
  color?: string;
  top?: boolean | BorderSideProps;
  right?: boolean | BorderSideProps;
  bottom?: boolean | BorderSideProps;
  left?: boolean | BorderSideProps;
}

export interface RadiusProps {
  all?: number | string;
  topLeft?: number | string;
  topRight?: number | string;
  bottomLeft?: number | string;
  bottomRight?: number | string;
}

export type AnimationType =
  | 'fade-in' | 'fade-out'
  | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right'
  | 'zoom-in' | 'zoom-out'
  | 'spin' | 'ping' | 'pulse' | 'bounce'
  | 'none';

export interface HotkeyConfig {
  key: string;
  modifiers?: Array<'ctrl' | 'alt' | 'shift' | 'meta'>;
  handler: (e: KeyboardEvent) => void;
  /** 'global' listens document-wide, 'local' requires element focus. Default: 'global' */
  scope?: 'global' | 'local';
}

export interface FrameProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  // Layout
  layout?: LayoutType;
  width?: string | number;
  height?: string | number;
  minWidth?: string | number;
  maxWidth?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;
  
  // Flex/Grid
  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  align?: AlignmentType;
  justify?: JustifyType;
  gap?: string | number;
  wrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: string | number;
  
  // Spacing
  padding?: SpacingProp;
  margin?: SpacingProp;
  
  // Visuals
  fill?: string;
  background?: string;

  backgroundColor?: string;
  backgroundGradient?: string;
  backgroundImage?: string;
  backgroundSize?: 'cover' | 'contain' | 'auto' | string;
  backgroundPosition?: string;
  backgroundRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
  borderRadius?: number | string | RadiusProps;
  border?: string | BorderProps;
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
  
  // Effects
  shadows?: string | ShadowProps | ShadowProps[];
  opacity?: number;
  blur?: string | number;
  backdropBlur?: string | number;
  rotation?: number | string;
  clipContent?: boolean;
  
  // Positioning
  position?: 'relative' | 'absolute' | 'fixed' | 'sticky' | 'static';
  top?: string | number;
  right?: string | number;
  bottom?: string | number;
  left?: string | number;
  zIndex?: number;
  
  // Theme integration
  theme?: Theme;
  variant?: 'surface' | 'accent' | 'primary' | 'secondary' | 'none';

  // Interaction & States
  transition?: 'all' | 'colors' | 'opacity' | 'shadow' | 'transform' | 'none' | string;
  cursor?: React.CSSProperties['cursor'];
  pointerEvents?: 'none' | 'auto';
  userSelect?: 'none' | 'text' | 'all' | 'auto';
  textColor?: string;
  hoverFill?: 'bg-1' | 'bg-2' | 'bg-3' | 'accent' | 'primary' | 'secondary';
  focusRing?: boolean;
  activeScale?: number;
  disabledOpacity?: boolean;
  disabledPointerEvents?: boolean;

  // Loading state
  isLoading?: boolean;

  // Animation
  animate?: AnimationType;
  animationDuration?: number | string;
  animationDelay?: number | string;
  animationIterations?: number | 'infinite';

  // Extended events
  onHover?: React.MouseEventHandler<HTMLElement>;
  onHoverEnd?: React.MouseEventHandler<HTMLElement>;
  onHotkey?: HotkeyConfig | HotkeyConfig[];
  onZoom?: (delta: number, e: React.WheelEvent<HTMLElement>) => void;

  // Standards
  className?: string;
  children?: React.ReactNode;
}

const formatValue = (val: string | number | undefined): string | undefined => {
  if (val === undefined) return undefined;
  return typeof val === 'number' ? `${val}px` : val;
};

const mapSpacing = (prop: SpacingProp | undefined, prefix: 'padding' | 'margin'): React.CSSProperties => {
  if (!prop) return {};
  if (typeof prop === 'string' || typeof prop === 'number') {
    return { [prefix]: formatValue(prop) } as React.CSSProperties;
  }
  
  const styles: any = {};
  if (prop.x) {
    styles[`${prefix}Left`] = formatValue(prop.x);
    styles[`${prefix}Right`] = formatValue(prop.x);
  }
  if (prop.y) {
    styles[`${prefix}Top`] = formatValue(prop.y);
    styles[`${prefix}Bottom`] = formatValue(prop.y);
  }
  if (prop.top) styles[`${prefix}Top`] = formatValue(prop.top);
  if (prop.right) styles[`${prefix}Right`] = formatValue(prop.right);
  if (prop.bottom) styles[`${prefix}Bottom`] = formatValue(prop.bottom);
  if (prop.left) styles[`${prefix}Left`] = formatValue(prop.left);
  
  return styles as React.CSSProperties;
};

const mapShadow = (shadowProp: ShadowProps): string => {
  return `${shadowProp.inset ? 'inset ' : ''}${formatValue(shadowProp.x || 0)} ${formatValue(shadowProp.y || 0)} ${formatValue(shadowProp.blur || 0)} ${formatValue(shadowProp.spread || 0)} ${shadowProp.color || 'rgba(0,0,0,0.5)'}`;
};

// Full literal strings so Tailwind JIT can scan them
const HOVER_FILL_MAP = {
  'bg-1':      'hover:bg-[var(--bg-1)]',
  'bg-2':      'hover:bg-[var(--bg-2)]',
  'bg-3':      'hover:bg-[var(--bg-3)]',
  'accent':    'hover:bg-[var(--accent-1)]',
  'primary':   'hover:bg-[var(--primary-1)]',
  'secondary': 'hover:bg-[var(--secondary-1)]',
} as const;

const ACTIVE_SCALE_MAP: Record<number, string> = {
  0.95: 'active:scale-[0.95]',
  0.97: 'active:scale-[0.97]',
  0.98: 'active:scale-[0.98]',
  0.99: 'active:scale-[0.99]',
};

const TRANSITION_MAP: Record<string, string> = {
  all:       'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  colors:    'color, background-color, border-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  opacity:   'opacity 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  shadow:    'box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  transform: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  none:      'none',
};

// Tailwind built-in animation classes
const TAILWIND_ANIM_MAP: Partial<Record<AnimationType, string>> = {
  spin:   'animate-spin',
  ping:   'animate-ping',
  pulse:  'animate-pulse',
  bounce: 'animate-bounce',
};

// Custom keyframe-based animations
const CUSTOM_ANIMS = new Set<AnimationType>([
  'fade-in', 'fade-out',
  'slide-up', 'slide-down', 'slide-left', 'slide-right',
  'zoom-in', 'zoom-out',
]);

// Inject keyframes once at module load (client-only)
let _kfInjected = false;
function ensureKeyframes() {
  if (_kfInjected || typeof document === 'undefined') return;
  const s = document.createElement('style');
  s.setAttribute('data-frame-kf', '');
  s.textContent = `
@keyframes frame-fade-in    { from{opacity:0}                          to{opacity:1} }
@keyframes frame-fade-out   { from{opacity:1}                          to{opacity:0} }
@keyframes frame-slide-up   { from{opacity:0;transform:translateY(10px)}   to{opacity:1;transform:translateY(0)} }
@keyframes frame-slide-down { from{opacity:0;transform:translateY(-10px)}  to{opacity:1;transform:translateY(0)} }
@keyframes frame-slide-left { from{opacity:0;transform:translateX(10px)}   to{opacity:1;transform:translateX(0)} }
@keyframes frame-slide-right{ from{opacity:0;transform:translateX(-10px)}  to{opacity:1;transform:translateX(0)} }
@keyframes frame-zoom-in    { from{opacity:0;transform:scale(0.96)}        to{opacity:1;transform:scale(1)} }
@keyframes frame-zoom-out   { from{opacity:1;transform:scale(1)}           to{opacity:0;transform:scale(0.96)} }
@keyframes frame-spin       { to{transform:rotate(360deg)} }
`;
  document.head.appendChild(s);
  _kfInjected = true;
}
ensureKeyframes();

/**
 * Frame Component
 * A foundational layout primitive with Figma-like API.
 */
export const Frame = forwardRef<HTMLElement, FrameProps>(({
  as: Component = 'div',
  layout,
  width, height, minWidth, maxWidth, minHeight, maxHeight,
  direction, align, justify, gap, wrap,
  flexGrow, flexShrink, flexBasis,
  padding, margin,
  fill, background, backgroundColor, backgroundGradient, backgroundImage, backgroundSize, backgroundPosition, backgroundRepeat,
  borderRadius, border, borderTop, borderRight, borderBottom, borderLeft, borderColor, borderStyle,
  shadows, opacity, blur, backdropBlur, rotation, clipContent,
  position, top, right, bottom, left, zIndex,
  onClick, onDoubleClick, onContextMenu, onMouseEnter, onMouseLeave, onMouseDown, onMouseUp, onFocus, onBlur, onKeyDown, onKeyUp, onWheel,
  theme, variant = 'none',
  transition, cursor, pointerEvents, userSelect, textColor,
  hoverFill, focusRing, activeScale, disabledOpacity, disabledPointerEvents,
  isLoading,
  animate, animationDuration, animationDelay, animationIterations,
  onHover, onHoverEnd, onHotkey, onZoom,
  className, children, style,
  ...props
}, ref) => {

  const customStyles = useMemo(() => {
    const s: React.CSSProperties = { ...style };

    // Layout
    if (layout) s.display = layout;
    if (width !== undefined) s.width = formatValue(width);
    if (height !== undefined) s.height = formatValue(height);
    if (minWidth !== undefined) s.minWidth = formatValue(minWidth);
    if (maxWidth !== undefined) s.maxWidth = formatValue(maxWidth);
    if (minHeight !== undefined) s.minHeight = formatValue(minHeight);
    if (maxHeight !== undefined) s.maxHeight = formatValue(maxHeight);

    // Flex/Grid
    if (direction) s.flexDirection = direction;
    if (align) {
      const alignMap = { start: 'flex-start', end: 'flex-end', center: 'center', baseline: 'baseline', stretch: 'stretch' };
      s.alignItems = alignMap[align];
    }
    if (justify) {
      const justifyMap = { start: 'flex-start', end: 'flex-end', center: 'center', between: 'space-between', around: 'space-around', evenly: 'space-evenly' };
      s.justifyContent = justifyMap[justify];
    }
    if (gap !== undefined) s.gap = formatValue(gap);
    if (wrap) s.flexWrap = wrap;
    if (flexGrow !== undefined) s.flexGrow = flexGrow;
    if (flexShrink !== undefined) s.flexShrink = flexShrink;
    if (flexBasis !== undefined) s.flexBasis = formatValue(flexBasis);

    // Spacing
    Object.assign(s, mapSpacing(padding, 'padding'));
    Object.assign(s, mapSpacing(margin, 'margin'));

    // Visuals
    if (fill) s.background = fill;
    if (background) s.background = background;
    if (backgroundColor) s.backgroundColor = backgroundColor;
    if (backgroundGradient) s.background = backgroundGradient;
    if (backgroundImage) {
      s.backgroundImage = `url(${backgroundImage})`;
      s.backgroundSize = backgroundSize || 'cover';
      s.backgroundPosition = backgroundPosition || 'center';
      s.backgroundRepeat = backgroundRepeat || 'no-repeat';
    }
    
    if (borderRadius !== undefined) {
      if (typeof borderRadius === 'object') {
        const br = borderRadius as RadiusProps;
        if (br.all) s.borderRadius = formatValue(br.all);
        if (br.topLeft) s.borderTopLeftRadius = formatValue(br.topLeft);
        if (br.topRight) s.borderTopRightRadius = formatValue(br.topRight);
        if (br.bottomLeft) s.borderBottomLeftRadius = formatValue(br.bottomLeft);
        if (br.bottomRight) s.borderBottomRightRadius = formatValue(br.bottomRight);
      } else {
        s.borderRadius = formatValue(borderRadius as string | number);
      }
    }

    if (border) {
      if (typeof border === 'string') {
        s.border = border;
      } else {
        const b = border as BorderProps;
        const defaultWidth = formatValue(b.width || 1);
        const defaultStyle = b.style || 'solid';
        const defaultColor = b.color || 'currentColor';

        if (b.top || b.right || b.bottom || b.left) {
          if (b.top) {
            const side = typeof b.top === 'object' ? b.top : {};
            s.borderTop = `${formatValue(side.width) || defaultWidth} ${side.style || defaultStyle} ${side.color || defaultColor}`;
          }
          if (b.right) {
            const side = typeof b.right === 'object' ? b.right : {};
            s.borderRight = `${formatValue(side.width) || defaultWidth} ${side.style || defaultStyle} ${side.color || defaultColor}`;
          }
          if (b.bottom) {
            const side = typeof b.bottom === 'object' ? b.bottom : {};
            s.borderBottom = `${formatValue(side.width) || defaultWidth} ${side.style || defaultStyle} ${side.color || defaultColor}`;
          }
          if (b.left) {
            const side = typeof b.left === 'object' ? b.left : {};
            s.borderLeft = `${formatValue(side.width) || defaultWidth} ${side.style || defaultStyle} ${side.color || defaultColor}`;
          }
        } else {
          s.border = `${defaultWidth} ${defaultStyle} ${defaultColor}`;
        }
      }
    }

    // Individual border shorthand (CSS-like: e.g. "1px solid #fff")
    if (borderTop !== undefined) s.borderTop = borderTop;
    if (borderRight !== undefined) s.borderRight = borderRight;
    if (borderBottom !== undefined) s.borderBottom = borderBottom;
    if (borderLeft !== undefined) s.borderLeft = borderLeft;
    if (borderColor) s.borderColor = borderColor;
    if (borderStyle) s.borderStyle = borderStyle;

    // Effects
    if (shadows) {
      if (typeof shadows === 'string') {
        s.boxShadow = shadows;
      } else if (Array.isArray(shadows)) {
        s.boxShadow = shadows.map(mapShadow).join(', ');
      } else {
        s.boxShadow = mapShadow(shadows as ShadowProps);
      }
    }

    if (opacity !== undefined) s.opacity = opacity;
    if (blur !== undefined) s.filter = `blur(${formatValue(blur)})`;
    if (backdropBlur !== undefined) s.backdropFilter = `blur(${formatValue(backdropBlur)})`;
    if (rotation !== undefined) s.transform = `rotate(${typeof rotation === 'number' ? `${rotation}deg` : rotation})`;
    if (clipContent) s.overflow = 'hidden';

    // Positioning
    if (position) s.position = position;
    if (top !== undefined) s.top = formatValue(top);
    if (right !== undefined) s.right = formatValue(right);
    if (bottom !== undefined) s.bottom = formatValue(bottom);
    if (left !== undefined) s.left = formatValue(left);
    if (zIndex !== undefined) s.zIndex = zIndex;

    // Interaction
    if (transition) s.transition = TRANSITION_MAP[transition] ?? transition;
    if (cursor) s.cursor = cursor;
    if (pointerEvents) s.pointerEvents = pointerEvents;
    if (userSelect) s.userSelect = userSelect;
    if (textColor) s.color = textColor;

    // Animation
    if (animate && animate !== 'none') {
      if (CUSTOM_ANIMS.has(animate)) {
        const dur  = animationDuration  !== undefined ? (typeof animationDuration  === 'number' ? `${animationDuration}ms`  : animationDuration)  : '300ms';
        const del  = animationDelay     !== undefined ? (typeof animationDelay     === 'number' ? `${animationDelay}ms`     : animationDelay)     : '0ms';
        const iter = animationIterations !== undefined ? String(animationIterations) : '1';
        s.animation = `frame-${animate} ${dur} cubic-bezier(0.4,0,0.2,1) ${del} ${iter} forwards`;
      } else if (TAILWIND_ANIM_MAP[animate]) {
        // duration/delay overrides for Tailwind built-ins via inline style
        if (animationDuration   !== undefined) s.animationDuration       = typeof animationDuration   === 'number' ? `${animationDuration}ms`   : animationDuration;
        if (animationDelay      !== undefined) s.animationDelay          = typeof animationDelay      === 'number' ? `${animationDelay}ms`      : animationDelay;
        if (animationIterations !== undefined) s.animationIterationCount = String(animationIterations);
      }
    }

    // Loading overlay needs a positioning context
    if (isLoading && !s.position) s.position = 'relative';

    return s;
  }, [
    layout, width, height, minWidth, maxWidth, minHeight, maxHeight,
    direction, align, justify, gap, wrap,
    flexGrow, flexShrink, flexBasis,
    padding, margin,
    fill, background, backgroundColor, backgroundGradient, backgroundImage, backgroundSize, backgroundPosition, backgroundRepeat,
    borderRadius, border, borderTop, borderRight, borderBottom, borderLeft, borderColor, borderStyle,
    shadows, opacity, blur, backdropBlur, rotation, clipContent,
    position, top, right, bottom, left, zIndex,
    transition, cursor, pointerEvents, userSelect, textColor,
    animate, animationDuration, animationDelay, animationIterations, isLoading,
    variant, style
  ]);

  const variantClasses = {
    none: '',
    surface: 'bg-[var(--bg-2)] border-[var(--border-1)] border-solid text-[var(--text-1)]',
    accent: 'bg-[var(--accent-1)] text-white border-transparent border-solid',
    primary: 'bg-[var(--primary-1)] text-[var(--primary-2)] border-[var(--primary-3)] border-solid',
    secondary: 'bg-[var(--secondary-1)] text-[var(--secondary-2)] border-[var(--secondary-3)] border-solid',
  };

  const stateClasses = cn(
    hoverFill && HOVER_FILL_MAP[hoverFill],
    focusRing && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-1)]',
    activeScale !== undefined && ACTIVE_SCALE_MAP[activeScale],
    disabledOpacity && 'disabled:opacity-50',
    disabledPointerEvents && 'disabled:pointer-events-none',
  );

  const themeClass = theme ? `theme-${theme}` : '';
  const animateClass = animate && animate !== 'none' ? (TAILWIND_ANIM_MAP[animate] ?? '') : '';

  // Internal ref for hotkey local-scope checks; combined with forwarded ref
  const internalRef = useRef<HTMLElement>(null);
  const combinedRef = useCallback((node: HTMLElement | null) => {
    (internalRef as React.MutableRefObject<HTMLElement | null>).current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node;
  }, [ref]);

  // Hotkey registration
  useEffect(() => {
    if (!onHotkey) return;
    const hotkeys = Array.isArray(onHotkey) ? onHotkey : [onHotkey];
    const handle = (e: KeyboardEvent) => {
      for (const hk of hotkeys) {
        if (hk.scope === 'local' && document.activeElement !== internalRef.current) continue;
        const mods = hk.modifiers ?? [];
        if (mods.includes('ctrl')  && !e.ctrlKey)  continue;
        if (mods.includes('alt')   && !e.altKey)   continue;
        if (mods.includes('shift') && !e.shiftKey) continue;
        if (mods.includes('meta')  && !e.metaKey)  continue;
        if (e.key.toLowerCase() !== hk.key.toLowerCase()) continue;
        e.preventDefault();
        hk.handler(e);
      }
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onHotkey]);

  return (
    <Component
      ref={combinedRef}
      style={customStyles}
      className={cn(
        variant !== 'none' && 'border',
        variantClasses[variant],
        themeClass,
        stateClasses,
        animateClass,
        className
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onHover ?? onMouseEnter}
      onMouseLeave={onHoverEnd ?? onMouseLeave}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onWheel={onZoom ? (e: React.WheelEvent<HTMLElement>) => {
        if (e.ctrlKey) { e.preventDefault(); onZoom(-e.deltaY / 100, e); }
        else onWheel?.(e);
      } : onWheel}
      {...props}
    >
      {children}
      {isLoading && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.25)',
            zIndex: 50,
            borderRadius: 'inherit',
          }}
        >
          <div style={{
            width: 18, height: 18,
            borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: 'var(--accent-1, #5a51b7)',
            animation: 'frame-spin 0.65s linear infinite',
          }} />
        </div>
      )}
    </Component>
  );
});

Frame.displayName = 'Frame';

Frame.displayName = 'Frame';
