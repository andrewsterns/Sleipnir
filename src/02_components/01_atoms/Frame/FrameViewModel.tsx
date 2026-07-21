import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import { cn } from '../../../utils/cn';
import {
  FrameProps, FillProps, SpacingProp,
  AnimationType, RadiusProps, BorderProps,
  DimensionProp, ShadowEffect, FillProp, ChamferProp,
  TextureEffect,
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
  const s: Record<string, string | undefined> = {};
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

export interface ResolvedFillLayer {
  image: string;
  size: string;
  position: string;
  repeat: string;
  blend: string;
  /** True layer opacity (gradient/image/pattern) — rendered as an underlay div. */
  opacity?: number;
}

interface MultiFillResult {
  css: React.CSSProperties;
  /** Layers needing true layer opacity, topmost first. Rendered as underlay divs. */
  underlays: ResolvedFillLayer[];
}

const EMPTY_MULTI_FILL: MultiFillResult = { css: {}, underlays: [] };

/** Applies Figma-style per-fill opacity to a color. */
const applyAlpha = (color: string, opacity?: number): string =>
  opacity === undefined || opacity >= 1
    ? color
    : `color-mix(in srgb, ${color} ${opacity * 100}%, transparent)`;

/** Resolves a single FillProp to a background layer descriptor. Video returns null (overlay element). */
const resolveFillLayer = (fill: FillProp): ResolvedFillLayer | null => {
  const base = { size: 'auto', position: '0% 0%', repeat: 'no-repeat', blend: (fill.blendMode ?? 'normal') as string };
  if ('solid' in fill) {
    const color = applyAlpha(resolveToken(fill.solid), fill.opacity);
    return { ...base, image: `linear-gradient(${color}, ${color})` };
  }
  if ('lines' in fill) {
    const { angle = 135, spacing = 8, color = 'rgba(255,255,255,0.04)', width = 1 } = fill.lines;
    const c = applyAlpha(color, fill.opacity);
    return { ...base, image: `repeating-linear-gradient(${angle}deg, ${c} 0, ${c} ${width}px, transparent ${width}px, transparent ${spacing}px)` };
  }
  if ('linear-gradient' in fill)  return { ...base, image: `linear-gradient(${fill['linear-gradient']})`,  opacity: fill.opacity };
  if ('radial-gradient' in fill)  return { ...base, image: `radial-gradient(${fill['radial-gradient']})`,  opacity: fill.opacity };
  if ('angular-gradient' in fill) return { ...base, image: `conic-gradient(${fill['angular-gradient']})`,  opacity: fill.opacity };
  // CSS has no diamond-gradient primitive — closest-side radial is the standard approximation
  if ('diamond-gradient' in fill) return { ...base, image: `radial-gradient(closest-side, ${fill['diamond-gradient']})`, opacity: fill.opacity };
  if ('pattern' in fill) return { ...base, repeat: 'repeat', image: `url(${fill.pattern})`, opacity: fill.opacity };
  if ('image' in fill) {
    const img = typeof fill.image === 'string' ? { src: fill.image } : fill.image;
    const mode = img.mode ?? 'fill';
    return {
      image: `url(${img.src})`,
      size: mode === 'fill' ? 'cover' : mode === 'fit' ? 'contain' : img.size ?? (mode === 'tile' ? 'auto' : 'cover'),
      position: img.position ?? 'center',
      repeat: mode === 'tile' ? 'repeat' : 'no-repeat',
      blend: (fill.blendMode ?? 'normal') as string,
      opacity: fill.opacity,
    };
  }
  return null;
};

/** Resolves FillProps into stacked CSS backgrounds. First = topmost (Figma fill-list order). */
const resolveMultiFill = (fills: FillProp[]): MultiFillResult => {
  const bg: ResolvedFillLayer[] = [];
  const underlays: ResolvedFillLayer[] = [];
  for (const f of fills) {
    if (f.visible === false) continue;
    const layer = resolveFillLayer(f);
    if (!layer) continue;
    if (layer.opacity !== undefined && layer.opacity < 1) underlays.push(layer);
    else bg.push(layer);
  }
  const css: React.CSSProperties = {};
  if (bg.length) {
    css.backgroundImage    = bg.map(l => l.image).join(', ');
    css.backgroundSize     = bg.map(l => l.size).join(', ');
    css.backgroundPosition = bg.map(l => l.position).join(', ');
    css.backgroundRepeat   = bg.map(l => l.repeat).join(', ');
    if (bg.some(l => l.blend !== 'normal')) css.backgroundBlendMode = bg.map(l => l.blend).join(', ');
  }
  return { css, underlays };
};

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

const VARIANT_CLASSES = {
  none:      '',
  surface:   'bg-[var(--bg-2)] border-[var(--border-1)] border-solid text-[var(--text-1)]',
  accent:    'bg-[var(--accent-1)] text-white border-transparent border-solid',
  primary:   'bg-[var(--primary-1)] text-[var(--primary-2)] border-[var(--primary-3)] border-solid',
  secondary: 'bg-[var(--secondary-1)] text-[var(--secondary-2)] border-[var(--secondary-3)] border-solid',
} as const;

// HTML void elements: cannot take children, so Frame skips overlays for them
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

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
.frame-hover-fill:hover   { background: var(--frame-hover-fill) !important; }
.frame-hover-stroke:hover { border-color: var(--frame-hover-stroke) !important; }
.frame-hover-text:hover   { color: var(--frame-hover-text) !important; }
`;
  document.head.appendChild(el);
  _kfInjected = true;
}
ensureKeyframes();

// ─── ViewModel output ────────────────────────────────────────────────────────

/** Data the view needs to render Frame's child overlays (fills, video, effects, loading). */
export interface FrameOverlayData {
  /** Fill layers with true layer opacity, pre-reversed so the topmost paints last. */
  underlays: ResolvedFillLayer[];
  video: { url: string; opacity?: number } | null;
  noise: { opacity: number } | null;
  texture?: TextureEffect;
  isLoading: boolean;
}

/**
 * Frame's viewmodel: resolves every Figma-style prop (fill, stroke, radius,
 * chamfer, effects, layout, positioning, animation, interaction) into plain
 * style objects, class names, event handlers and overlay data. The view only
 * renders what this hook returns.
 */
export function useFrameViewModel(
  {
    as: Component = 'div',

    // Figma-native: layout
    flow, w, h, minW, maxW, minH, maxH, size,

    // Figma-native: fill / stroke / radius / chamfer
    fill, stroke, radius, round, chamfer,

    // Figma-native: effects
    effects, opacity, clipContent, scroll, aspect, blendMode,

    // Figma-native: flex / grid
    grow, shrink, basis, selfAlign,
    cols, rows, colSpan, rowSpan,

    // Figma-native: positioning
    absolute, fixed, sticky, relative, x, y, inset, z, translate,

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
    transition, cursor, pointerEvents, userSelect, textColor, caretColor,
    hoverFill, hoverStroke, hoverTextColor,
    focusRing, activeScale, disabledOpacity, disabledPointerEvents,

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
    ...domProps
  }: FrameProps,
  ref: React.ForwardedRef<HTMLElement>,
) {

  // ── Resolve fill ─────────────────────────────────────────────────────────
  // Layer engine: fill arrays, and any single fill needing per-layer features
  // (gradients, images, patterns, lines). Plain { solid } and { video } keep
  // their dedicated fast paths below.
  const multiFill = useMemo((): MultiFillResult => {
    if (fillProps || !fill) return EMPTY_MULTI_FILL;
    if (Array.isArray(fill)) return resolveMultiFill(fill as FillProp[]);
    if (typeof fill !== 'object') return EMPTY_MULTI_FILL;
    const f = fill as FillProp;
    if (f.visible === false || 'solid' in f || 'video' in f) return EMPTY_MULTI_FILL;
    return resolveMultiFill([f]);
  }, [fill, fillProps]);

  const hasFillUnderlays = multiFill.underlays.length > 0;
  const usesLayerEngine = hasFillUnderlays || Object.keys(multiFill.css).length > 0;

  // Single-fill fast paths (solid / video) + advanced fillProps compat
  let computedFillProps: FillProps | undefined = fillProps;
  if (!fillProps && fill && !Array.isArray(fill) && typeof fill === 'object' && !usesLayerEngine) {
    const f = fill as FillProp;
    if (f.visible !== false) {
      if ('solid' in f)      computedFillProps = { type: 'solid', color: applyAlpha(resolveToken(f.solid), f.opacity) };
      else if ('video' in f) computedFillProps = { type: 'video', videoUrl: f.video, opacity: f.opacity };
    }
  }

  // ── Gradient stroke detection ─────────────────────────────────────────────
  const gradientStroke = stroke && typeof stroke === 'object' && !Array.isArray(stroke) && 'gradient' in stroke
    ? stroke as { gradient: string; width?: number | string }
    : null;
  const strokeWidth = gradientStroke ? (Number(String(gradientStroke.width ?? 1).replace('px', '')) || 1) : 1;

  // ── Derive whether overlays are needed ────────────────────────────────────
  const hasNoiseOverlay   = !!effects?.noise;
  const hasTextureOverlay = !!effects?.texture;
  const hasOverlay = hasNoiseOverlay || hasTextureOverlay || isLoading || hasFillUnderlays;

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
    if (Object.keys(multiFill.css).length > 0) {
      Object.assign(s, multiFill.css);
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
        } else if (stroke.position === 'outside' || stroke.position === 'center') {
          // Figma stroke position: outline draws outside the box without
          // consuming layout space; negative offset centers it on the edge.
          s.outline = `${sw} ${ss} ${sc}`;
          const wNum = Number(String(stroke.width ?? 1).replace('px', '')) || 1;
          s.outlineOffset = stroke.position === 'center' ? `${-wNum / 2}px` : '0px';
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
        if (!computedFillProps && !background && !backgroundColor && !multiFill.css.backgroundImage) {
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

    // ── Transform (translate + rotation compose into one) ──────────────────
    const transformParts: string[] = [];
    if (translate && (translate.x !== undefined || translate.y !== undefined)) {
      transformParts.push(`translate(${formatValue(translate.x ?? 0)}, ${formatValue(translate.y ?? 0)})`);
    }
    if (rotation !== undefined) transformParts.push(`rotate(${typeof rotation === 'number' ? `${rotation}deg` : rotation})`);
    if (transformParts.length) s.transform = transformParts.join(' ');

    // ── Clip / Scroll ───────────────────────────────────────────────────────
    if (clipContent) s.overflow = 'hidden';
    if (scroll === 'both') s.overflow  = 'auto';
    else if (scroll === 'x') s.overflowX = 'auto';
    else if (scroll === 'y') s.overflowY = 'auto';

    // Fill underlays sit at z-index -1; isolate so they stay inside this frame
    if (hasFillUnderlays) s.isolation = 'isolate';

    // ── Positioning ─────────────────────────────────────────────────────────
    if (position) {
      s.position = position;
    } else if (absolute) {
      s.position = 'absolute';
    } else if (fixed) {
      s.position = 'fixed';
    } else if (sticky) {
      s.position = 'sticky';
    } else if (relative || flow === 'freeform' || hasOverlay) {
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
    if (caretColor)    s.caretColor    = resolveToken(caretColor);

    // Hover-state colors ride CSS vars consumed by the injected
    // .frame-hover-* rules; hoverFill presets keep their Tailwind class.
    const sv = s as Record<string, string | number | undefined>;
    if (hoverFill && !(hoverFill in HOVER_FILL_MAP)) sv['--frame-hover-fill'] = resolveToken(hoverFill);
    if (hoverStroke)    sv['--frame-hover-stroke'] = resolveToken(hoverStroke);
    if (hoverTextColor) sv['--frame-hover-text']   = resolveToken(hoverTextColor);

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
    multiFill, hasFillUnderlays, computedFillProps, fill, background, backgroundColor, backgroundGradient,
    backgroundImage, backgroundSize, backgroundPosition, backgroundRepeat,
    stroke, gradientStroke, border, borderTop, borderRight, borderBottom, borderLeft, borderColor, borderStyle,
    radius, borderRadius, round, chamfer,
    effects, opacity, blendMode,
    blur, backdropBlur, rotation,
    clipContent, scroll,
    absolute, fixed, sticky, relative, x, y, inset, z, translate,
    position, top, right, bottom, left, zIndex,
    transition, cursor, pointerEvents, userSelect, textColor, caretColor,
    hoverFill, hoverStroke, hoverTextColor,
    animate, animationDuration, animationDelay, animationIterations,
    hasOverlay, isLoading,
  ]);

  // ── Class names ──────────────────────────────────────────────────────────
  const stateClasses = cn(
    hoverFill && (hoverFill in HOVER_FILL_MAP
      ? HOVER_FILL_MAP[hoverFill as keyof typeof HOVER_FILL_MAP]
      : 'frame-hover-fill'),
    hoverStroke && 'frame-hover-stroke',
    hoverTextColor && 'frame-hover-text',
    focusRing && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-1)]',
    activeScale !== undefined && ACTIVE_SCALE_MAP[activeScale],
    disabledOpacity && 'disabled:opacity-50',
    disabledPointerEvents && 'disabled:pointer-events-none',
  );

  const themeClass   = theme ? `theme-${theme}` : '';
  const animateClass = animate && animate !== 'none' ? (TAILWIND_ANIM_MAP[animate] ?? '') : '';

  // Theme class goes on the wrapper in gradient-stroke mode, on the frame otherwise
  const frameClassName = cn(
    variant !== 'none' && 'border',
    VARIANT_CLASSES[variant],
    !gradientStroke && themeClass,
    stateClasses,
    animateClass,
    className,
  );

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

  // ── Overlay data (fill underlays, video, noise, texture, loading) ─────────
  const noiseOpacity = effects?.noise === true ? 0.08
    : typeof effects?.noise === 'object' ? (effects.noise.opacity ?? 0.08)
    : 0;

  const overlays: FrameOverlayData = {
    // Reversed so fills[0] (topmost in Figma order) paints last/on top
    underlays: hasFillUnderlays ? [...multiFill.underlays].reverse() : [],
    video: computedFillProps?.type === 'video' && computedFillProps.videoUrl
      ? { url: computedFillProps.videoUrl, opacity: computedFillProps.opacity }
      : null,
    noise: hasNoiseOverlay ? { opacity: noiseOpacity } : null,
    texture: effects?.texture,
    isLoading: !!isLoading,
  };

  // ── Gradient stroke: split styles between wrapper and frame ───────────────
  let wrapper: { style: React.CSSProperties; className: string } | null = null;
  let frameStyle: React.CSSProperties;

  if (gradientStroke) {
    // Outer gets layout/positioning, inner gets content styles
    const outerStyle: React.CSSProperties = {};
    const innerStyle: React.CSSProperties = {};

    for (const [key, val] of Object.entries(customStyles)) {
      if (OUTER_STYLE_KEYS.has(key)) outerStyle[key as keyof React.CSSProperties] = val as never;
      else innerStyle[key as keyof React.CSSProperties] = val as never;
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

    wrapper = { style: outerStyle, className: cn(themeClass) };
    frameStyle = { ...innerStyle, ...style };
  } else {
    frameStyle = { ...customStyles, ...style };
  }

  return {
    Component,
    combinedRef,
    eventHandlers,
    wrapper,
    frameStyle,
    frameClassName,
    overlays,
    disabled,
    children,
    domProps,
    isVoid: typeof Component === 'string' && VOID_ELEMENTS.has(Component),
  };
}
