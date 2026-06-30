import React, { useMemo, forwardRef, useEffect, useRef, useCallback } from 'react';
import { cn } from '../../../utils/cn';
import {
  FrameProps, FillProps, SpacingProp,
  AnimationType, RadiusProps, BorderProps,
  DimensionProp, ShadowEffect, FillProp, ChamferProp,
} from './iFrame';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatValue = (val: string | number | undefined): string | undefined => {
  if (val === undefined) return undefined;
  return typeof val === 'number' ? `${val}px` : val;
};

const mapSpacing = (prop: SpacingProp | undefined, prefix: 'padding' | 'margin'): React.CSSProperties => {
  if (!prop) return {};
  if (typeof prop === 'string' || typeof prop === 'number') {
    return { [prefix]: formatValue(prop) } as React.CSSProperties;
  }
  const s: any = {};
  if (prop.x)      { s[`${prefix}Left`] = formatValue(prop.x);  s[`${prefix}Right`]  = formatValue(prop.x);  }
  if (prop.y)      { s[`${prefix}Top`]  = formatValue(prop.y);  s[`${prefix}Bottom`] = formatValue(prop.y);  }
  if (prop.top)    s[`${prefix}Top`]    = formatValue(prop.top);
  if (prop.right)  s[`${prefix}Right`]  = formatValue(prop.right);
  if (prop.bottom) s[`${prefix}Bottom`] = formatValue(prop.bottom);
  if (prop.left)   s[`${prefix}Left`]   = formatValue(prop.left);
  return s;
};

/** Resolves a design token or CSS color to a usable CSS value. */
export const resolveToken = (val: string): string => {
  if (!val) return val;
  if (val.startsWith('#') || val.startsWith('rgb') || val.startsWith('hsl')) return val;
  if (val.startsWith('var(')) return val;
  return `var(--${val.replace(/^[^a-zA-Z0-9_-]+/, '')})`;
};

const resolveDim = (val: DimensionProp, axis: 'x' | 'y'): string => {
  if (val === 'hug')    return 'fit-content';
  if (val === 'fill')   return '100%';
  if (val === 'screen') return axis === 'x' ? '100vw' : '100vh';
  return formatValue(val) as string;
};

const resolveCols = (val: number | string): string =>
  typeof val === 'number' ? `repeat(${val}, 1fr)` : val;

const shadowEffectToString = (s: ShadowEffect, inset = false): string => {
  const x      = s.x      !== undefined ? `${s.x}px` : '0px';
  const y      = s.y      !== undefined ? `${s.y}px` : '0px';
  const blur   = s.blur   !== undefined ? `${s.blur}px` : '0px';
  const spread = s.spread !== undefined ? `${s.spread}px` : '0px';
  const color  = s.color ?? 'rgba(0,0,0,0.3)';
  return `${inset ? 'inset ' : ''}${x} ${y} ${blur} ${spread} ${color}`;
};

// ─── Chamfer ─────────────────────────────────────────────────────────────────

/**
 * Builds a CSS clip-path polygon string for chamfered (45°-cut) corners.
 * All values are in pixels; `inset` shrinks each cut by that amount (used for inner layer).
 */
export const buildChamferClipPath = (chamfer: ChamferProp, inset: number = 0): string => {
  const n = typeof chamfer === 'number'
    ? { topLeft: chamfer, topRight: chamfer, bottomRight: chamfer, bottomLeft: chamfer }
    : { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0, ...chamfer };

  const tl = Math.max(0, n.topLeft   - inset);
  const tr = Math.max(0, n.topRight  - inset);
  const br = Math.max(0, n.bottomRight - inset);
  const bl = Math.max(0, n.bottomLeft - inset);

  const a = (v: number) => v === 0 ? '0%'   : `${v}px`;
  const c = (v: number) => v === 0 ? '100%' : `calc(100% - ${v}px)`;

  return `polygon(${a(tl)} 0%, ${c(tr)} 0%, 100% ${a(tr)}, 100% ${c(br)}, ${c(br)} 100%, ${a(bl)} 100%, 0% ${c(bl)}, 0% ${a(tl)})`;
};

// ─── Multi-fill resolution ────────────────────────────────────────────────────

/** Resolves a single FillProp to a CSS background-image layer string (for stacking). */
const resolveFillLayer = (fill: FillProp): string => {
  if ('solid' in fill) {
    const color = resolveToken(fill.solid);
    return `linear-gradient(${color}, ${color})`;
  }
  if ('linear-gradient' in fill) return `linear-gradient(${fill['linear-gradient']})`;
  if ('radial-gradient' in fill) return `radial-gradient(${fill['radial-gradient']})`;
  if ('image' in fill)   return `url(${fill.image})`;
  if ('pattern' in fill) return `url(${fill.pattern})`;
  if ('lines' in fill) {
    const { angle = 135, spacing = 8, color = 'rgba(255,255,255,0.04)', width = 1 } = fill.lines;
    return `repeating-linear-gradient(${angle}deg, ${color} 0, ${color} ${width}px, transparent ${width}px, transparent ${spacing}px)`;
  }
  return '';
};

/** Resolves an array of FillProps into stacked CSS background-image. First = topmost. */
const resolveMultiFill = (fills: FillProp[]): React.CSSProperties => {
  const layers = fills.map(resolveFillLayer).filter(Boolean);
  return layers.length ? { backgroundImage: layers.join(', ') } : {};
};

// ─── Noise texture (SVG turbulence, rendered as child overlay) ───────────────

const NOISE_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

// ─── Static maps ─────────────────────────────────────────────────────────────

const HOVER_FILL_MAP = {
  'bg-1':      'hover:bg-[var(--bg-1)]',
  'bg-2':      'hover:bg-[var(--bg-2)]',
  'bg-3':      'hover:bg-[var(--bg-3)]',
  'accent':    'hover:bg-[var(--accent-1)]',
  'primary':   'hover:bg-[var(--primary-1)]',
  'secondary': 'hover:bg-[var(--secondary-1)]',
} as const;

const ACTIVE_SCALE_MAP: Record<number, string> = {
  0.95: 'active:scale-[0.95]', 0.97: 'active:scale-[0.97]',
  0.98: 'active:scale-[0.98]', 0.99: 'active:scale-[0.99]',
};

const TRANSITION_MAP: Record<string, string> = {
  all:       'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  colors:    'color, background-color, border-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  opacity:   'opacity 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  shadow:    'box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  transform: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  none:      'none',
};

const TAILWIND_ANIM_MAP: Partial<Record<AnimationType, string>> = {
  spin: 'animate-spin', ping: 'animate-ping',
  pulse: 'animate-pulse', bounce: 'animate-bounce',
};

const CUSTOM_ANIMS = new Set<AnimationType>([
  'fade-in', 'fade-out', 'slide-up', 'slide-down',
  'slide-left', 'slide-right', 'zoom-in', 'zoom-out',
]);

const ALIGN_MAP: Record<string, string> = {
  start: 'flex-start', end: 'flex-end',
  center: 'center', baseline: 'baseline', stretch: 'stretch',
};
const JUSTIFY_MAP: Record<string, string> = {
  start: 'flex-start', end: 'flex-end', center: 'center',
  between: 'space-between', around: 'space-around', evenly: 'space-evenly',
};

// CSS properties that belong on the outer wrapper when gradient stroke is used
const OUTER_STYLE_KEYS = new Set([
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'aspectRatio',
  'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf',
  'gridColumn', 'gridRow',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'position', 'left', 'top', 'right', 'bottom', 'inset', 'zIndex',
  'opacity', 'mixBlendMode', 'transform',
  'transition', 'cursor', 'pointerEvents',
  'animation', 'animationDuration', 'animationDelay', 'animationIterationCount',
]);

// ─── Keyframes ───────────────────────────────────────────────────────────────

let _kfInjected = false;
function ensureKeyframes() {
  if (_kfInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.setAttribute('data-frame-kf', '');
  el.textContent = `
@keyframes frame-fade-in    { from{opacity:0}                           to{opacity:1} }
@keyframes frame-fade-out   { from{opacity:1}                           to{opacity:0} }
@keyframes frame-slide-up   { from{opacity:0;transform:translateY(10px)}   to{opacity:1;transform:translateY(0)} }
@keyframes frame-slide-down { from{opacity:0;transform:translateY(-10px)}  to{opacity:1;transform:translateY(0)} }
@keyframes frame-slide-left { from{opacity:0;transform:translateX(10px)}   to{opacity:1;transform:translateX(0)} }
@keyframes frame-slide-right{ from{opacity:0;transform:translateX(-10px)}  to{opacity:1;transform:translateX(0)} }
@keyframes frame-zoom-in    { from{opacity:0;transform:scale(0.96)}        to{opacity:1;transform:scale(1)} }
@keyframes frame-zoom-out   { from{opacity:1;transform:scale(1)}           to{opacity:0;transform:scale(0.96)} }
@keyframes frame-spin       { to{transform:rotate(360deg)} }
`;
  document.head.appendChild(el);
  _kfInjected = true;
}
ensureKeyframes();

// ─── Frame ───────────────────────────────────────────────────────────────────

export const Frame = forwardRef<HTMLElement, FrameProps>(({
  as: Component = 'div',

  // Figma-native: layout
  flow, w, h, minW, maxW, minH, maxH, size,

  // Figma-native: fill / stroke / radius / chamfer
  fill, stroke, radius, round, chamfer,

  // Figma-native: effects
  effects, opacity, clipContent, aspect, blendMode,

  // Figma-native: flex / grid
  grow, shrink, basis, selfAlign,
  cols, rows, colSpan, rowSpan,

  // Figma-native: positioning
  absolute, fixed, sticky, x, y, inset, z,

  // Explicit layout override
  layout,

  // Flex / Grid (verbose compat)
  direction, align, justify, gap, wrap,
  flexGrow, flexShrink, flexBasis,

  // Dimensions (verbose compat)
  width, height, minWidth, maxWidth, minHeight, maxHeight,

  // Spacing
  padding, margin,

  // Fill (advanced)
  fillProps,

  // Low-level CSS escapes (compat)
  background, backgroundColor, backgroundGradient,
  backgroundImage, backgroundSize, backgroundPosition, backgroundRepeat,
  borderRadius, border,
  borderTop, borderRight, borderBottom, borderLeft, borderColor, borderStyle,
  blur, backdropBlur, rotation,

  // Positioning (verbose compat)
  position, top, right, bottom, left, zIndex,

  // Theme / variant
  theme, variant = 'none',

  // Interaction
  transition, cursor, pointerEvents, userSelect, textColor,
  hoverFill, focusRing, activeScale, disabledOpacity, disabledPointerEvents,

  // Loading
  isLoading,

  // Animation
  animate, animationDuration, animationDelay, animationIterations,

  // Events
  onClick, onDoubleClick, onContextMenu,
  onMouseEnter, onMouseLeave, onMouseDown, onMouseUp,
  onFocus, onBlur, onKeyDown, onKeyUp, onWheel,
  onHover, onHoverEnd, onHotkey, onZoom,

  disabled,
  className, children, style,
  ...props
}, ref) => {

  // ── Resolve fill ─────────────────────────────────────────────────────────
  // Multi-fill array: resolve to stacked backgroundImage CSS
  const multiFillStyles = useMemo((): React.CSSProperties => {
    if (fillProps || !fill) return {};
    if (Array.isArray(fill)) return resolveMultiFill(fill as FillProp[]);
    // Single fill: lines type needs special handling too
    if ('lines' in (fill as FillProp)) return resolveMultiFill([fill as FillProp]);
    return {};
  }, [fill, fillProps]);

  // Single-fill to FillProps (non-array, non-lines, backward compat)
  let computedFillProps: FillProps | undefined = fillProps;
  if (!fillProps && fill && !Array.isArray(fill)) {
    const f = fill as FillProp;
    if ('solid' in f)                computedFillProps = { type: 'solid',    color: resolveToken(f.solid) };
    else if ('linear-gradient' in f) computedFillProps = { type: 'gradient', gradient: f['linear-gradient'] };
    else if ('radial-gradient' in f) computedFillProps = { type: 'gradient', gradient: f['radial-gradient'] };
    else if ('pattern' in f)         computedFillProps = { type: 'pattern',  patternUrl: f.pattern };
    else if ('image' in f)           computedFillProps = { type: 'image',    imageUrl: f.image };
    else if ('video' in f)           computedFillProps = { type: 'video',    videoUrl: f.video };
    // 'lines' handled by multiFillStyles above
  }

  // ── Gradient stroke detection ─────────────────────────────────────────────
  const gradientStroke = stroke && typeof stroke === 'object' && !Array.isArray(stroke) && 'gradient' in stroke
    ? stroke as { gradient: string; width?: number | string; [k: string]: any }
    : null;
  const strokeWidth = gradientStroke ? (Number(String(gradientStroke.width ?? 1).replace('px', '')) || 1) : 1;

  // ── Derive whether overlays are needed ────────────────────────────────────
  const hasNoiseOverlay   = !!effects?.noise;
  const hasTextureOverlay = !!effects?.texture;
  const hasOverlay = hasNoiseOverlay || hasTextureOverlay || isLoading;

  // ── Styles ────────────────────────────────────────────────────────────────
  const customStyles = useMemo((): React.CSSProperties => {
    const s: React.CSSProperties = {};

    // ── Flow / Display ──────────────────────────────────────────────────────
    if (layout) {
      s.display = layout;
    } else if (flow === 'vertical' || flow === 'horizontal') {
      s.display = 'flex';
    } else if (flow === 'grid') {
      s.display = 'grid';
    }

    // ── Flex direction ──────────────────────────────────────────────────────
    if (direction) {
      s.flexDirection = direction;
    } else if (flow === 'vertical') {
      s.flexDirection = 'column';
    } else if (flow === 'horizontal') {
      s.flexDirection = 'row';
    }

    // ── Dimensions ──────────────────────────────────────────────────────────
    if (size !== undefined) { s.width = formatValue(size); s.height = formatValue(size); }
    if (w !== undefined)          s.width     = resolveDim(w, 'x');
    else if (width !== undefined)  s.width    = formatValue(width);
    if (h !== undefined)          s.height    = resolveDim(h, 'y');
    else if (height !== undefined) s.height   = formatValue(height);
    if (minW !== undefined)          s.minWidth  = resolveDim(minW, 'x');
    else if (minWidth !== undefined)  s.minWidth  = formatValue(minWidth);
    if (maxW !== undefined)          s.maxWidth  = resolveDim(maxW, 'x');
    else if (maxWidth !== undefined)  s.maxWidth  = formatValue(maxWidth);
    if (minH !== undefined)          s.minHeight = resolveDim(minH, 'y');
    else if (minHeight !== undefined) s.minHeight = formatValue(minHeight);
    if (maxH !== undefined)          s.maxHeight = resolveDim(maxH, 'y');
    else if (maxHeight !== undefined) s.maxHeight = formatValue(maxHeight);

    if (aspect !== undefined) s.aspectRatio = String(aspect);

    // ── Flex / Grid children props ──────────────────────────────────────────
    if (align)   s.alignItems    = ALIGN_MAP[align];
    if (justify) s.justifyContent = JUSTIFY_MAP[justify];
    if (gap !== undefined) s.gap = formatValue(gap);
    if (wrap)    s.flexWrap      = wrap;

    const resolvedGrow   = grow   !== undefined ? (grow   === true ? 1 : grow)   : flexGrow;
    const resolvedShrink = shrink !== undefined ? (shrink === true ? 1 : shrink) : flexShrink;
    const resolvedBasis  = basis  !== undefined ? basis : flexBasis;
    if (resolvedGrow   !== undefined) s.flexGrow   = resolvedGrow as number;
    if (resolvedShrink !== undefined) s.flexShrink = resolvedShrink as number;
    if (resolvedBasis  !== undefined) s.flexBasis  = formatValue(resolvedBasis);
    if (selfAlign)                    s.alignSelf  = ALIGN_MAP[selfAlign] as React.CSSProperties['alignSelf'];

    // ── Grid template ───────────────────────────────────────────────────────
    if (cols !== undefined)    s.gridTemplateColumns = resolveCols(cols);
    if (rows !== undefined)    s.gridTemplateRows    = resolveCols(rows);
    if (colSpan !== undefined) s.gridColumn = typeof colSpan === 'number' ? `span ${colSpan}` : colSpan;
    if (rowSpan !== undefined) s.gridRow    = typeof rowSpan === 'number' ? `span ${rowSpan}` : rowSpan;

    // ── Spacing ─────────────────────────────────────────────────────────────
    Object.assign(s, mapSpacing(padding, 'padding'));
    Object.assign(s, mapSpacing(margin, 'margin'));

    // ── Fill ────────────────────────────────────────────────────────────────
    if (Object.keys(multiFillStyles).length > 0) {
      Object.assign(s, multiFillStyles);
    } else {
      const fp = computedFillProps;
      if (fp) {
        switch (fp.type) {
          case 'solid':
            s.background = fp.color;
            break;
          case 'gradient':
            s.background = fp.gradient;
            break;
          case 'pattern':
            s.backgroundImage    = `url(${fp.patternUrl})`;
            s.backgroundSize     = fp.size     || 'auto';
            s.backgroundPosition = fp.position || 'center';
            s.backgroundRepeat   = (fp.repeat  || 'repeat') as React.CSSProperties['backgroundRepeat'];
            break;
          case 'image':
            s.backgroundImage    = `url(${fp.imageUrl})`;
            s.backgroundSize     = fp.size     || 'cover';
            s.backgroundPosition = fp.position || 'center';
            s.backgroundRepeat   = (fp.repeat  || 'no-repeat') as React.CSSProperties['backgroundRepeat'];
            break;
        }
      } else {
        if (fill && typeof fill === 'string') s.background = resolveToken(fill as string);
        if (background)         s.background      = background;
        if (backgroundColor)    s.backgroundColor = backgroundColor;
        if (backgroundGradient) s.background      = backgroundGradient;
        if (backgroundImage) {
          s.backgroundImage    = `url(${backgroundImage})`;
          s.backgroundSize     = backgroundSize     || 'cover';
          s.backgroundPosition = backgroundPosition || 'center';
          s.backgroundRepeat   = (backgroundRepeat  || 'no-repeat') as React.CSSProperties['backgroundRepeat'];
        }
      }
    }

    // ── Stroke (skip if gradient — handled by wrapper) ───────────────────────
    if (!gradientStroke && stroke !== undefined) {
      if (typeof stroke === 'string') {
        s.border = stroke;
      } else {
        const sw = formatValue(stroke.width ?? 1) as string;
        const ss = stroke.style ?? 'solid';
        const sc = stroke.color ? resolveToken(stroke.color) : 'var(--border-1)';
        const hasSides = stroke.top !== undefined || stroke.right !== undefined
          || stroke.bottom !== undefined || stroke.left !== undefined;
        if (hasSides) {
          const side = (v: boolean | { color?: string; width?: number | string; style?: string } | undefined) => {
            if (!v) return null;
            const sp = typeof v === 'object' ? v : {};
            return `${sp.width !== undefined ? formatValue(sp.width) : sw} ${sp.style ?? ss} ${sp.color ? resolveToken(sp.color) : sc}`;
          };
          const t = side(stroke.top), r = side(stroke.right);
          const b = side(stroke.bottom), l = side(stroke.left);
          if (t) s.borderTop    = t;
          if (r) s.borderRight  = r;
          if (b) s.borderBottom = b;
          if (l) s.borderLeft   = l;
        } else {
          s.border = `${sw} ${ss} ${sc}`;
        }
      }
    } else if (!gradientStroke && border !== undefined) {
      if (typeof border === 'string') {
        s.border = border;
      } else {
        const b = border as BorderProps;
        const dw = formatValue(b.width || 1);
        const ds = b.style || 'solid';
        const dc = b.color || 'currentColor';
        if (b.top || b.right || b.bottom || b.left) {
          const side = (v: typeof b.top) => {
            const sp = typeof v === 'object' ? v : {};
            return `${formatValue(sp.width) || dw} ${sp.style || ds} ${sp.color || dc}`;
          };
          if (b.top)    s.borderTop    = side(b.top);
          if (b.right)  s.borderRight  = side(b.right);
          if (b.bottom) s.borderBottom = side(b.bottom);
          if (b.left)   s.borderLeft   = side(b.left);
        } else {
          s.border = `${dw} ${ds} ${dc}`;
        }
      }
    }
    if (borderTop    !== undefined) s.borderTop    = borderTop;
    if (borderRight  !== undefined) s.borderRight  = borderRight;
    if (borderBottom !== undefined) s.borderBottom = borderBottom;
    if (borderLeft   !== undefined) s.borderLeft   = borderLeft;
    if (borderColor)  s.borderColor  = borderColor;
    if (borderStyle)  s.borderStyle  = borderStyle;

    // ── Radius ──────────────────────────────────────────────────────────────
    if (!chamfer) {
      if (round) {
        s.borderRadius = '9999px';
      } else {
        const rp = radius ?? borderRadius;
        if (rp !== undefined) {
          if (typeof rp === 'object') {
            const br = rp as RadiusProps;
            if (br.all)         s.borderRadius            = formatValue(br.all);
            if (br.topLeft)     s.borderTopLeftRadius     = formatValue(br.topLeft);
            if (br.topRight)    s.borderTopRightRadius    = formatValue(br.topRight);
            if (br.bottomLeft)  s.borderBottomLeftRadius  = formatValue(br.bottomLeft);
            if (br.bottomRight) s.borderBottomRightRadius = formatValue(br.bottomRight);
          } else {
            s.borderRadius = formatValue(rp as string | number);
          }
        }
      }
    }

    // ── Chamfer clip-path (no gradient stroke — that's handled in render) ────
    if (chamfer && !gradientStroke) {
      s.clipPath = buildChamferClipPath(chamfer);
    }

    // ── Effects ─────────────────────────────────────────────────────────────
    if (effects) {
      const shadowParts: string[] = [];
      if (effects['drop-shadow']) {
        const ds = Array.isArray(effects['drop-shadow']) ? effects['drop-shadow'] : [effects['drop-shadow']];
        ds.forEach(d => shadowParts.push(shadowEffectToString(d, false)));
      }
      if (effects['inner-shadow']) {
        const is = Array.isArray(effects['inner-shadow']) ? effects['inner-shadow'] : [effects['inner-shadow']];
        is.forEach(i => shadowParts.push(shadowEffectToString(i, true)));
      }
      if (shadowParts.length) s.boxShadow = shadowParts.join(', ');

      if (effects['layer-blur'] !== undefined) {
        s.filter = `blur(${effects['layer-blur']}px)`;
      } else if (blur !== undefined) {
        s.filter = `blur(${formatValue(blur)})`;
      }

      if (effects.glass) {
        const g = effects.glass === true ? {} : effects.glass;
        const glassBlur = g.blur ?? 16;
        const sat       = g.saturation ?? 180;
        s.backdropFilter = `blur(${glassBlur}px) saturate(${sat}%)`;
        if (!computedFillProps && !background && !backgroundColor && !multiFillStyles.backgroundImage) {
          s.background = g.tint
            ? resolveToken(g.tint)
            : `rgba(255, 255, 255, ${g.opacity ?? 0.08})`;
        }
      }

      if (effects['background-blur'] !== undefined) {
        const bbBlur = effects['background-blur'];
        const sat = effects.glass && effects.glass !== true ? (effects.glass.saturation ?? 180) : undefined;
        s.backdropFilter = sat ? `blur(${bbBlur}px) saturate(${sat}%)` : `blur(${bbBlur}px)`;
      } else if (!effects.glass && backdropBlur !== undefined) {
        s.backdropFilter = `blur(${formatValue(backdropBlur)})`;
      }
    } else {
      if (blur !== undefined)        s.filter         = `blur(${formatValue(blur)})`;
      if (backdropBlur !== undefined) s.backdropFilter = `blur(${formatValue(backdropBlur)})`;
    }

    // ── Opacity ─────────────────────────────────────────────────────────────
    if (opacity !== undefined) s.opacity = opacity;

    if (blendMode)  s.mixBlendMode = blendMode;
    if (rotation !== undefined) s.transform = `rotate(${typeof rotation === 'number' ? `${rotation}deg` : rotation})`;

    // ── Clip ────────────────────────────────────────────────────────────────
    if (clipContent) s.overflow = 'hidden';

    // ── Positioning ─────────────────────────────────────────────────────────
    if (position) {
      s.position = position;
    } else if (absolute) {
      s.position = 'absolute';
    } else if (fixed) {
      s.position = 'fixed';
    } else if (sticky) {
      s.position = 'sticky';
    } else if (flow === 'freeform' || hasOverlay) {
      s.position = 'relative';
    }

    if (inset !== undefined) s.inset = inset === true ? '0' : (formatValue(inset as string | number) as string);
    if (x !== undefined)      s.left   = formatValue(x);
    else if (left !== undefined) s.left = formatValue(left);
    if (y !== undefined)      s.top    = formatValue(y);
    else if (top !== undefined)  s.top  = formatValue(top);
    if (right  !== undefined)   s.right  = formatValue(right);
    if (bottom !== undefined)   s.bottom = formatValue(bottom);

    const resolvedZ = z ?? zIndex;
    if (resolvedZ !== undefined) s.zIndex = resolvedZ;

    // ── Interaction ─────────────────────────────────────────────────────────
    if (transition)    s.transition    = TRANSITION_MAP[transition] ?? transition;
    if (cursor)        s.cursor        = cursor;
    if (pointerEvents) s.pointerEvents = pointerEvents;
    if (userSelect)    s.userSelect    = userSelect;
    if (textColor)     s.color         = textColor;

    // ── Animation ───────────────────────────────────────────────────────────
    if (animate && animate !== 'none') {
      if (CUSTOM_ANIMS.has(animate)) {
        const dur  = animationDuration  !== undefined ? (typeof animationDuration  === 'number' ? `${animationDuration}ms`  : animationDuration)  : '300ms';
        const del  = animationDelay     !== undefined ? (typeof animationDelay     === 'number' ? `${animationDelay}ms`     : animationDelay)     : '0ms';
        const iter = animationIterations !== undefined ? String(animationIterations) : '1';
        s.animation = `frame-${animate} ${dur} cubic-bezier(0.4,0,0.2,1) ${del} ${iter} forwards`;
      } else if (TAILWIND_ANIM_MAP[animate]) {
        if (animationDuration   !== undefined) s.animationDuration       = typeof animationDuration   === 'number' ? `${animationDuration}ms`   : animationDuration;
        if (animationDelay      !== undefined) s.animationDelay          = typeof animationDelay      === 'number' ? `${animationDelay}ms`      : animationDelay;
        if (animationIterations !== undefined) s.animationIterationCount = String(animationIterations);
      }
    }

    if (isLoading && !s.position) s.position = 'relative';

    return s;
  }, [
    flow, layout, w, h, minW, maxW, minH, maxH, size, aspect,
    width, height, minWidth, maxWidth, minHeight, maxHeight,
    direction, align, justify, gap, wrap,
    grow, shrink, basis, selfAlign, flexGrow, flexShrink, flexBasis,
    cols, rows, colSpan, rowSpan,
    padding, margin,
    multiFillStyles, computedFillProps, fill, background, backgroundColor, backgroundGradient,
    backgroundImage, backgroundSize, backgroundPosition, backgroundRepeat,
    stroke, gradientStroke, border, borderTop, borderRight, borderBottom, borderLeft, borderColor, borderStyle,
    radius, borderRadius, round, chamfer,
    effects, opacity, blendMode,
    blur, backdropBlur, rotation,
    clipContent,
    absolute, fixed, sticky, x, y, inset, z,
    position, top, right, bottom, left, zIndex,
    transition, cursor, pointerEvents, userSelect, textColor,
    animate, animationDuration, animationDelay, animationIterations,
    hasOverlay, isLoading,
  ]);

  // ── Class names ──────────────────────────────────────────────────────────
  const variantClasses = {
    none:      '',
    surface:   'bg-[var(--bg-2)] border-[var(--border-1)] border-solid text-[var(--text-1)]',
    accent:    'bg-[var(--accent-1)] text-white border-transparent border-solid',
    primary:   'bg-[var(--primary-1)] text-[var(--primary-2)] border-[var(--primary-3)] border-solid',
    secondary: 'bg-[var(--secondary-1)] text-[var(--secondary-2)] border-[var(--secondary-3)] border-solid',
  };

  const stateClasses = cn(
    hoverFill && HOVER_FILL_MAP[hoverFill],
    focusRing && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-1)]',
    activeScale !== undefined && ACTIVE_SCALE_MAP[activeScale],
    disabledOpacity && 'disabled:opacity-50',
    disabledPointerEvents && 'disabled:pointer-events-none',
  );

  const themeClass   = theme ? `theme-${theme}` : '';
  const animateClass = animate && animate !== 'none' ? (TAILWIND_ANIM_MAP[animate] ?? '') : '';

  // ── Refs & hotkeys ───────────────────────────────────────────────────────
  const internalRef = useRef<HTMLElement>(null);
  const combinedRef = useCallback((node: HTMLElement | null) => {
    (internalRef as React.MutableRefObject<HTMLElement | null>).current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node;
  }, [ref]);

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

  // ── Effect overlay helpers ───────────────────────────────────────────────
  const noiseOpacity = effects?.noise === true ? 0.08
    : typeof effects?.noise === 'object' ? (effects.noise.opacity ?? 0.08)
    : 0;

  const textureEffect = effects?.texture;

  // ── Shared event handlers ────────────────────────────────────────────────
  const eventHandlers = {
    onClick, onDoubleClick, onContextMenu,
    onMouseEnter: onHover ?? onMouseEnter,
    onMouseLeave: onHoverEnd ?? onMouseLeave,
    onMouseDown, onMouseUp,
    onFocus, onBlur, onKeyDown, onKeyUp,
    onWheel: onZoom
      ? (e: React.WheelEvent<HTMLElement>) => {
          if (e.ctrlKey) { e.preventDefault(); onZoom(-e.deltaY / 100, e); }
          else onWheel?.(e);
        }
      : onWheel,
  };

  // ── Overlays (noise, texture, loading, video) ────────────────────────────
  const overlays = (
    <>
      {computedFillProps?.type === 'video' && computedFillProps.videoUrl && (
        <video
          src={computedFillProps.videoUrl}
          autoPlay loop muted playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
        />
      )}
      {hasNoiseOverlay && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            borderRadius: 'inherit',
            backgroundImage: `url("${NOISE_DATA_URL}")`,
            backgroundRepeat: 'repeat',
            backgroundSize: '200px 200px',
            opacity: noiseOpacity,
            mixBlendMode: 'overlay',
            pointerEvents: 'none',
          }}
        />
      )}
      {textureEffect && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            borderRadius: 'inherit',
            backgroundImage: `url("${textureEffect.src}")`,
            backgroundSize: textureEffect.size ?? 'cover',
            backgroundRepeat: textureEffect.size === 'repeat' ? 'repeat' : 'no-repeat',
            opacity: textureEffect.opacity ?? 1,
            mixBlendMode: textureEffect.blendMode ?? 'normal',
            pointerEvents: 'none',
          }}
        />
      )}
      {isLoading && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.25)', zIndex: 50, borderRadius: 'inherit',
          }}
        >
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: 'var(--accent-1, #5a51b7)',
            animation: 'frame-spin 0.65s linear infinite',
          }} />
        </div>
      )}
    </>
  );

  // ── Render: gradient stroke wrapper pattern ───────────────────────────────
  if (gradientStroke) {
    // Split customStyles: outer gets layout/positioning, inner gets content styles
    const outerStyle: React.CSSProperties = {};
    const innerStyle: React.CSSProperties = {};

    for (const [key, val] of Object.entries(customStyles)) {
      if (OUTER_STYLE_KEYS.has(key)) outerStyle[key as keyof React.CSSProperties] = val as any;
      else innerStyle[key as keyof React.CSSProperties] = val as any;
    }

    // Outer: gradient fill + chamfer + grid so inner fills it
    outerStyle.background = `linear-gradient(${gradientStroke.gradient})`;
    outerStyle.display    = 'grid';
    outerStyle.padding    = `${strokeWidth}px`;
    if (chamfer) outerStyle.clipPath = buildChamferClipPath(chamfer);
    if (!outerStyle.position) outerStyle.position = 'relative';

    // Inner: content + inner chamfer (reduced by stroke width)
    if (chamfer) innerStyle.clipPath = buildChamferClipPath(chamfer, strokeWidth);
    if (hasOverlay && !innerStyle.position) innerStyle.position = 'relative';

    return (
      <div
        ref={combinedRef as React.Ref<HTMLDivElement>}
        style={outerStyle}
        className={cn(themeClass)}
      >
        <Component
          style={{ ...innerStyle, ...style }}
          className={cn(
            variant !== 'none' && 'border',
            variantClasses[variant],
            stateClasses,
            animateClass,
            className,
          )}
          disabled={disabled}
          {...eventHandlers}
          {...props}
        >
          {overlays}
          {children}
        </Component>
      </div>
    );
  }

  // ── Render: standard (no gradient stroke wrapper) ─────────────────────────
  return (
    <Component
      ref={combinedRef}
      style={{ ...customStyles, ...style }}
      className={cn(
        variant !== 'none' && 'border',
        variantClasses[variant],
        themeClass,
        stateClasses,
        animateClass,
        className
      )}
      disabled={disabled}
      {...eventHandlers}
      {...props}
    >
      {overlays}
      {children}
    </Component>
  );
});

Frame.displayName = 'Frame';

export type { FrameProps } from './iFrame';
