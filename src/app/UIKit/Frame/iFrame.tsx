import React from 'react';

export type FillType = 'solid' | 'gradient' | 'pattern' | 'image' | 'video';

export interface FillProps {
  type: FillType;
  color?: string;
  gradient?: string;
  patternUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  size?: string;
  position?: string;
  repeat?: string;
  opacity?: number;
}

/**
 * Per-fill layer controls, mirroring Figma's fill list.
 *
 * `opacity`   — Figma's per-fill opacity slider (0–1). Solid/lines layers apply
 *               it to the color; gradient/image/pattern layers render as an
 *               underlay div for true layer opacity (those always paint above
 *               fully-opaque background layers, below children).
 * `blendMode` — blends this layer against the fill layers below it
 *               (CSS background-blend-mode). To blend the whole frame against
 *               what's behind it, use the element-level `blendMode` prop.
 * `visible`   — Figma's eye toggle. `false` removes the layer.
 */
export interface FillLayerOptions {
  opacity?: number;
  blendMode?: React.CSSProperties['mixBlendMode'];
  visible?: boolean;
}

/**
 * Image fill with Figma scale modes:
 *   fill → cover · fit → contain · tile → repeat · crop → custom size/position
 */
export interface ImageFillOptions {
  src: string;
  mode?: 'fill' | 'fit' | 'crop' | 'tile';
  /** CSS background-position. Default: center */
  position?: string;
  /** CSS background-size — pair with mode 'crop' (any value) or 'tile' (tile size). */
  size?: string;
}

/**
 * Figma-style fill. Token strings (e.g. 'primary-3') auto-resolve to var(--primary-3).
 * Every layer accepts Figma per-fill controls: opacity, blendMode, visible.
 *
 * Gradient types match Figma: linear, radial, angular (CSS conic-gradient),
 * diamond (approximated with a closest-side radial — CSS has no diamond primitive).
 *
 * @example
 *   fill={{ solid: '#fff' }}
 *   fill={{ solid: 'primary-3', opacity: 0.5 }}
 *   fill={{ 'linear-gradient': '90deg, #000, #fff' }}
 *   fill={{ 'angular-gradient': 'from 45deg, #0ff, #f0f, #0ff' }}
 *   fill={{ image: '/hero.png' }}
 *   fill={{ image: { src: '/tile.png', mode: 'tile', size: '24px' } }}
 *   fill={{ video: '/bg.mp4' }}
 *   fill={{ lines: { angle: 135, spacing: 8, color: 'rgba(255,255,255,0.04)', width: 1 } }}
 *   fill={[{ lines: { angle: 135, spacing: 8 } }, { solid: 'bg-2' }]}
 *   fill={[{ image: { src: '/hero.png' }, blendMode: 'luminosity' }, { solid: 'bg-2' }]}
 */
export type FillProp =
  | ({ solid: string } & FillLayerOptions)
  | ({ 'linear-gradient': string } & FillLayerOptions)
  | ({ 'radial-gradient': string } & FillLayerOptions)
  | ({ 'angular-gradient': string } & FillLayerOptions)
  | ({ 'diamond-gradient': string } & FillLayerOptions)
  | ({ pattern: string } & FillLayerOptions)
  | ({ image: string | ImageFillOptions } & FillLayerOptions)
  | ({ video: string } & FillLayerOptions)
  | ({ lines: { angle?: number; spacing?: number; color?: string; width?: number } } & FillLayerOptions);

// ─── Chamfer ─────────────────────────────────────────────────────────────────

/**
 * Chamfer (45° cut corner) size in pixels. A single number applies to all corners.
 *
 * @example
 *   chamfer={8}
 *   chamfer={{ topLeft: 12, bottomRight: 12 }}
 */
export type ChamferProp =
  | number
  | { topLeft?: number; topRight?: number; bottomRight?: number; bottomLeft?: number };

// ─── Flow ────────────────────────────────────────────────────────────────────

/**
 * Figma auto-layout mode.
 *
 *   freeform   → no auto-layout; children place freely (sets position:relative)
 *   vertical   → display:flex, flex-direction:column
 *   horizontal → display:flex, flex-direction:row
 *   grid       → display:grid (pair with cols/rows props)
 */
export type FlowType = 'freeform' | 'vertical' | 'horizontal' | 'grid';

// ─── Stroke ──────────────────────────────────────────────────────────────────

export interface StrokeSideProps {
  color?: string;
  width?: number | string;
  style?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
}

/**
 * Figma-style stroke (border). Token colors auto-resolve.
 * When `gradient` is provided, renders a gradient border using a wrapper element
 * (works best combined with `chamfer`).
 *
 * @example
 *   stroke={{ color: 'border-1', width: 1 }}
 *   stroke={{ color: 'border-1', width: 2, position: 'outside' }}
 *   stroke={{ bottom: { color: 'border-1' } }}
 *   stroke="1px solid var(--border-1)"
 *   stroke={{ gradient: '135deg, rgba(0,255,136,0.6), rgba(0,80,40,0.08)', width: 1 }}
 */
export type StrokeProp =
  | string
  | {
      color?: string;
      width?: number | string;
      style?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
      /**
       * Figma stroke position. Default: 'inside' (CSS border).
       * 'outside' and 'center' render via CSS outline so they don't consume
       * layout space — uniform strokes only (ignored when per-side or
       * gradient strokes are used; outline does not follow chamfer clipping).
       */
      position?: 'inside' | 'center' | 'outside';
      /** Gradient string for gradient border, e.g. '135deg, #0f0, #030'. Triggers wrapper render. */
      gradient?: string;
      top?: boolean | StrokeSideProps;
      right?: boolean | StrokeSideProps;
      bottom?: boolean | StrokeSideProps;
      left?: boolean | StrokeSideProps;
    };

// ─── Effects ─────────────────────────────────────────────────────────────────

export interface ShadowEffect {
  x?: number;
  y?: number;
  blur?: number;
  spread?: number;
  /** Color string or token (e.g. 'rgba(0,0,0,0.4)') */
  color?: string;
}

export interface GlassEffect {
  /** Backdrop blur in px. Default: 16 */
  blur?: number;
  /** Backdrop saturation %. Default: 180 */
  saturation?: number;
  /**
   * Background tint. Accepts any CSS color or token.
   * Defaults to rgba(255,255,255,0.08) if fill is not set.
   */
  tint?: string;
  /** Tint opacity when tint is not provided. Default: 0.08 */
  opacity?: number;
}

export interface NoiseEffect {
  /** Noise overlay opacity (0–1). Default: 0.08 */
  opacity?: number;
}

export interface TextureEffect {
  /** URL or data URI for the texture image */
  src: string;
  /** Overlay opacity (0–1). Default: 1 */
  opacity?: number;
  /** CSS mix-blend-mode for the texture layer */
  blendMode?: React.CSSProperties['mixBlendMode'];
  size?: 'cover' | 'contain' | 'repeat' | string;
}

/**
 * Figma-style visual effects applied to the frame.
 *
 * @example
 *   effects={{ 'drop-shadow': { x: 0, y: 4, blur: 16, color: 'rgba(0,0,0,0.4)' } }}
 *   effects={{ 'background-blur': 12 }}
 *   effects={{ glass: true }}
 *   effects={{ glass: { blur: 20, tint: 'rgba(30,30,40,0.3)' } }}
 *   effects={{ noise: { opacity: 0.06 } }}
 *   effects={{ texture: { src: '/grain.png', blendMode: 'overlay', opacity: 0.15 } }}
 *
 * Multiple effects can be combined:
 *   effects={{ glass: true, noise: { opacity: 0.05 } }}
 */
export interface FrameEffects {
  /** Outer drop shadow (CSS box-shadow) */
  'drop-shadow'?: ShadowEffect | ShadowEffect[];
  /** Inner shadow (CSS box-shadow inset) */
  'inner-shadow'?: ShadowEffect | ShadowEffect[];
  /** Blur the frame and its children (CSS filter: blur). Value in px. */
  'layer-blur'?: number;
  /** Blur content behind the frame (CSS backdrop-filter: blur). Value in px. */
  'background-blur'?: number;
  /** Glassmorphism preset: backdrop-blur + saturation + tint. */
  glass?: boolean | GlassEffect;
  /** Grain/noise texture overlay. */
  noise?: boolean | NoiseEffect;
  /** Custom image/texture overlay. */
  texture?: TextureEffect;
}

// ─── Dimensions ──────────────────────────────────────────────────────────────

/**
 * Dimension value with Figma sizing tokens:
 *   "fill"   → 100%
 *   "hug"    → fit-content
 *   "screen" → 100vw (w) / 100vh (h)
 *   number   → Npx
 *   string   → any CSS value
 */
export type DimensionProp = number | 'fill' | 'hug' | 'screen' | (string & {});

// ─── Shared primitives ───────────────────────────────────────────────────────

export type LayoutType =
  | 'flex' | 'grid' | 'block'
  | 'inline-block' | 'inline-flex' | 'inline-grid'
  | 'none';

export type AlignType = 'start' | 'center' | 'end' | 'baseline' | 'stretch';
export type JustifyType = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
export type SpacingValue = string | number;

export type SpacingProp =
  | SpacingValue
  | { top?: SpacingValue; right?: SpacingValue; bottom?: SpacingValue; left?: SpacingValue; x?: SpacingValue; y?: SpacingValue };

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
  scope?: 'global' | 'local';
}

// ─── FrameProps ──────────────────────────────────────────────────────────────

// `translate` is omitted because the HTML global attribute ('yes'|'no') would
// otherwise collide with Frame's Figma-style translate object.
export interface FrameProps extends Omit<React.HTMLAttributes<HTMLElement>, 'translate'> {
  as?: React.ElementType;

  // ── Figma-native: Layout ─────────────────────────────────────────────────
  flow?: FlowType;

  /** Width. Tokens: "fill" → 100%, "hug" → fit-content, "screen" → 100vw */
  w?: DimensionProp;
  /** Height. Tokens: "fill" → 100%, "hug" → fit-content, "screen" → 100vh */
  h?: DimensionProp;
  minW?: DimensionProp;
  maxW?: DimensionProp;
  minH?: DimensionProp;
  maxH?: DimensionProp;
  /** Square shorthand: sets both w and h. Explicit w/h override. */
  size?: number | string;

  // ── Figma-native: Fill / Stroke / Radius ─────────────────────────────────
  /**
   * Single fill or array of layered fills (first = topmost, Figma fill-list order).
   * Types: solid, linear/radial/angular/diamond gradient, image (with scale
   * modes fill/fit/crop/tile), pattern, lines, video.
   * Each layer takes Figma per-fill controls: opacity, blendMode, visible.
   */
  fill?: FillProp | FillProp[];
  stroke?: StrokeProp;
  /** Corner radius. Prefer over borderRadius. */
  radius?: number | string | RadiusProps;
  /** border-radius: 9999px */
  round?: boolean;
  /**
   * Chamfer (45° cut corner) in pixels. Pair with stroke.gradient for a gradient border effect.
   * @example chamfer={8}  chamfer={{ topLeft: 12, bottomRight: 12 }}
   */
  chamfer?: ChamferProp;

  // ── Figma-native: Effects ─────────────────────────────────────────────────
  /**
   * Visual effects: drop-shadow, inner-shadow, layer-blur, background-blur,
   * glass, noise, texture. Multiple can be combined.
   */
  effects?: FrameEffects;

  /** Element opacity (0–1) */
  opacity?: number;

  /** Clip children to frame bounds (overflow: hidden) */
  clipContent?: boolean;

  /**
   * Figma scroll behavior: overflow auto on the given axis.
   * Combine with clipContent to clip the other axis.
   */
  scroll?: 'x' | 'y' | 'both';

  /** Aspect ratio — e.g. aspect={16/9} or aspect="16/9" */
  aspect?: number | string;

  /** CSS mix-blend-mode */
  blendMode?: React.CSSProperties['mixBlendMode'];

  // ── Figma-native: Flex / Grid ─────────────────────────────────────────────
  /**
   * flex-grow shorthand.
   *   grow     → flex-grow: 1
   *   grow={2} → flex-grow: 2
   */
  grow?: boolean | number;
  shrink?: boolean | number;
  basis?: string | number;
  /** align-self for this element inside its parent flex/grid */
  selfAlign?: AlignType;

  /** grid-template-columns. cols={3} → repeat(3, 1fr), cols="260px 1fr" → literal */
  cols?: number | string;
  /** grid-template-rows. Same shorthand logic as cols. */
  rows?: number | string;
  /** grid-column span. colSpan={2} → grid-column: span 2 */
  colSpan?: number | string;
  /** grid-row span */
  rowSpan?: number | string;

  // ── Figma-native: Positioning ─────────────────────────────────────────────
  /** position: absolute */
  absolute?: boolean;
  /** position: fixed */
  fixed?: boolean;
  /** position: sticky */
  sticky?: boolean;
  /** position: relative (anchor for absolute children) */
  relative?: boolean;
  /** left shorthand (for positioned frames) */
  x?: number | string;
  /** top shorthand (for positioned frames) */
  y?: number | string;
  /** Inset shorthand. true → 0, number/string → that value */
  inset?: boolean | number | string;
  /** z-index shorthand */
  z?: number;
  /**
   * CSS translate, composed with `rotation` into one transform.
   * Numbers are px; strings pass through (e.g. '-50%').
   * @example translate={{ x: '-50%', y: '-50%' }}  // center on x/y anchor
   */
  translate?: { x?: number | string; y?: number | string };

  // ── Layout (explicit display override) ────────────────────────────────────
  layout?: LayoutType;

  // ── Flex / Grid (verbose compat) ──────────────────────────────────────────
  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  align?: AlignType;
  justify?: JustifyType;
  gap?: string | number;
  wrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  /** @deprecated Use grow */
  flexGrow?: number;
  /** @deprecated Use shrink */
  flexShrink?: number;
  /** @deprecated Use basis */
  flexBasis?: string | number;

  // ── Dimensions (verbose compat) ───────────────────────────────────────────
  /** @deprecated Use w */
  width?: string | number;
  /** @deprecated Use h */
  height?: string | number;
  /** @deprecated Use minW */
  minWidth?: string | number;
  /** @deprecated Use maxW */
  maxWidth?: string | number;
  /** @deprecated Use minH */
  minHeight?: string | number;
  /** @deprecated Use maxH */
  maxHeight?: string | number;

  // ── Spacing ───────────────────────────────────────────────────────────────
  padding?: SpacingProp;
  margin?: SpacingProp;

  // ── Low-level CSS escapes (prefer fill / stroke / radius / effects) ───────
  background?: string;
  backgroundColor?: string;
  backgroundGradient?: string;
  backgroundImage?: string;
  backgroundSize?: 'cover' | 'contain' | 'auto' | string;
  backgroundPosition?: string;
  backgroundRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
  /** @deprecated Use radius */
  borderRadius?: number | string | RadiusProps;
  /** @deprecated Use stroke */
  border?: string | BorderProps;
  /** @deprecated Use stroke */
  borderTop?: string;
  /** @deprecated Use stroke */
  borderRight?: string;
  /** @deprecated Use stroke */
  borderBottom?: string;
  /** @deprecated Use stroke */
  borderLeft?: string;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
  /** @deprecated Use effects */
  blur?: string | number;
  /** @deprecated Use effects */
  backdropBlur?: string | number;
  rotation?: number | string;

  // ── Positioning (verbose compat) ──────────────────────────────────────────
  /** @deprecated Use absolute / fixed / sticky */
  position?: 'relative' | 'absolute' | 'fixed' | 'sticky' | 'static';
  /** @deprecated Use y */
  top?: string | number;
  right?: string | number;
  bottom?: string | number;
  /** @deprecated Use x */
  left?: string | number;
  /** @deprecated Use z */
  zIndex?: number;

  // ── Theme / variant ───────────────────────────────────────────────────────
  /** Theme scope — renders as a `theme-<name>` class (e.g. 'tactical'). */
  theme?: string;
  variant?: 'surface' | 'accent' | 'primary' | 'secondary' | 'none';

  // ── Interaction & states ──────────────────────────────────────────────────
  transition?: 'all' | 'colors' | 'opacity' | 'shadow' | 'transform' | 'none' | string;
  cursor?: React.CSSProperties['cursor'];
  pointerEvents?: 'none' | 'auto';
  userSelect?: 'none' | 'text' | 'all' | 'auto';
  textColor?: string;
  /** Hover background. Preset token, or any color/token string (e.g. 'primary-5', 'rgba(0,255,136,0.06)'). */
  hoverFill?: 'bg-1' | 'bg-2' | 'bg-3' | 'accent' | 'primary' | 'secondary' | (string & {});
  /** Hover border color (token or CSS color). Pair with a base `stroke`. */
  hoverStroke?: string;
  /** Hover text color (token or CSS color). */
  hoverTextColor?: string;
  /** caret-color for `as="input"` / editable frames (token or CSS color). */
  caretColor?: string;
  focusRing?: boolean;
  /** Press feedback scale. Only 0.95 / 0.97 / 0.98 / 0.99 have class mappings; other values silently no-op. */
  activeScale?: number;
  disabledOpacity?: boolean;
  disabledPointerEvents?: boolean;

  // ── Loading ───────────────────────────────────────────────────────────────
  isLoading?: boolean;

  // ── Animation ────────────────────────────────────────────────────────────
  animate?: AnimationType;
  animationDuration?: number | string;
  animationDelay?: number | string;
  animationIterations?: number | 'infinite';

  // ── Extended events ───────────────────────────────────────────────────────
  onHover?: React.MouseEventHandler<HTMLElement>;
  onHoverEnd?: React.MouseEventHandler<HTMLElement>;
  onHotkey?: HotkeyConfig | HotkeyConfig[];
  onZoom?: (delta: number, e: React.WheelEvent<HTMLElement>) => void;

  /** Advanced: pre-resolved fill object. Prefer the fill prop. */
  fillProps?: FillProps;

  /**
   * Mirrors the HTML `disabled` attribute for interactive elements (button, input, select).
   * Passed straight through to the underlying DOM element via the `as` prop.
   */
  disabled?: boolean;

  /**
   * Raw CSS escape hatch — merges last, winning over all resolved props.
   * Prefer fill / stroke / radius / effects / spacing / dimension props;
   * lint warns when style={{}} is used on components.
   */
  style?: React.CSSProperties;

  className?: string;
  children?: React.ReactNode;
}
