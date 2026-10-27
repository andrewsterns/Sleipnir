// CanvasStyle → CSS. The single style derivation, shared by the board renderer
// and the code emitter.
//
// Why one function instead of two: the board draws what this returns, and the
// emitted code contains what this returns. WYSIWYG is therefore exact by
// construction — there is no second layout engine that can drift, which is the
// failure mode that makes most design-to-code tools untrustworthy.
//
// Why plain CSS rather than emitting UIKit's <Frame>: an emitted component lands
// in the USER'S project, which has no reason to contain Sleipnir's UIKit. Emitting
// <Frame> would either break on import or force us to inject a runtime into
// someone else's codebase. Dependency-free divs keep the promise that the canvas
// only ever adds files to its own sandbox and never makes your project depend on
// anything.
//
// CanvasStyle keeps Frame's vocabulary (flow / gap / fills / 'fill' | 'hug'
// sizing), because that vocabulary is a good Figma-shaped box model — we just
// resolve it ourselves.

import { effectsCss, paintCss, type ImageUrlResolver } from './paint'
import type { CanvasRect, CanvasStyle, CanvasTextStyle, ColorRef, Size } from './types'

/** A plain CSS property bag — the shape React's `style` prop takes. */
export type CssProps = Record<string, string | number>

/**
 * A token id ('bg-2') becomes var(--bg-2); anything that already looks like a
 * literal color or CSS function is passed through untouched.
 */
export function cssColor(ref: ColorRef): string {
  const value = ref.trim()
  if (!value) return 'transparent'
  if (value.startsWith('#') || value.includes('(') || value.startsWith('var(')) return value
  if (value === 'transparent' || value === 'currentColor' || value === 'inherit') return value
  return `var(--${value})`
}

function cssSize(value: Size): string | number {
  if (value === 'fill') return '100%'
  if (value === 'hug') return 'fit-content'
  return value
}

const ALIGN: Record<NonNullable<CanvasStyle['align']>, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
}

const JUSTIFY: Record<NonNullable<CanvasStyle['justify']>, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
}

function paddingValue(padding: CanvasStyle['padding']): string | undefined {
  if (padding === undefined) return undefined
  if (typeof padding === 'number') return `${padding}px`
  const { top = 0, right = 0, bottom = 0, left = 0 } = padding
  return `${top}px ${right}px ${bottom}px ${left}px`
}

function radiusValue(radius: CanvasStyle['radius']): string | undefined {
  if (radius === undefined) return undefined
  if (typeof radius === 'number') return `${radius}px`
  const { tl = 0, tr = 0, br = 0, bl = 0 } = radius
  return `${tl}px ${tr}px ${br}px ${bl}px`
}

export interface ToCssOptions {
  /** Where image fills load from — see paint.ts's ImageUrlResolver. Without one, workspace images are skipped. */
  imageUrl?: ImageUrlResolver
  /** The node is text: drop shadows follow its glyphs instead of its box. */
  text?: boolean
}

const NO_IMAGES: ImageUrlResolver = () => undefined

/**
 * The style for a node's own box, excluding position (see positionCss) — the
 * part that is identical whether the node is free-positioned or laid out by a
 * parent's flow.
 */
export function toCss(style: CanvasStyle, { imageUrl = NO_IMAGES, text = false }: ToCssOptions = {}): CssProps {
  const css: CssProps = {}

  // W and H mean the BORDER BOX, exactly as they do in Figma — the number in the
  // inspector is the box you see, and padding eats into it rather than growing
  // it. CSS defaults the other way (content-box), which quietly made every
  // padded frame render 2×padding LARGER than its own rect: the selection ring,
  // drawn from the model, sat inset from the frame it named, and a 17px padding
  // put it 34px adrift in each dimension. Emitted unconditionally so adding
  // padding to a frame later can never re-open that gap.
  css.boxSizing = 'border-box'

  // ── layout ──
  const flow = style.flow ?? 'freeform'
  if (flow === 'vertical' || flow === 'horizontal') {
    css.display = 'flex'
    css.flexDirection = flow === 'vertical' ? 'column' : 'row'
  } else if (flow === 'grid') {
    css.display = 'grid'
    if (style.cols !== undefined) css.gridTemplateColumns = `repeat(${style.cols}, 1fr)`
  } else {
    // freeform: children position themselves absolutely against this box
    css.position = 'relative'
  }
  if (style.gap !== undefined) css.gap = `${style.gap}px`
  if (style.align) css.alignItems = ALIGN[style.align]
  if (style.justify) css.justifyContent = JUSTIFY[style.justify]
  if (style.wrap !== undefined) css.flexWrap = style.wrap ? 'wrap' : 'nowrap'
  const padding = paddingValue(style.padding)
  if (padding !== undefined) css.padding = padding

  // ── sizing ──
  if (style.w !== undefined) css.width = cssSize(style.w)
  if (style.h !== undefined) css.height = cssSize(style.h)
  if (style.minW !== undefined) css.minWidth = `${style.minW}px`
  if (style.maxW !== undefined) css.maxWidth = `${style.maxW}px`
  if (style.minH !== undefined) css.minHeight = `${style.minH}px`
  if (style.maxH !== undefined) css.maxHeight = `${style.maxH}px`
  if (style.grow) css.flexGrow = 1

  // ── paint ──
  // The whole fill stack (see paint.ts). Each paint's opacity stays inside its
  // own colors: it used to be written to `opacity`, which faded the node's
  // children along with its background — layer opacity, not fill opacity.
  Object.assign(css, paintCss(style.fills, imageUrl))
  if (style.stroke && style.stroke.width > 0) {
    const { color, width, style: lineStyle = 'solid', position = 'inside' } = style.stroke
    // EVERY stroke position is an outline, never a border. A stroke is paint, not
    // layout — that is Figma's model, and CSS's `border` breaks it twice over:
    //
    //   1. it consumes space (only 'inside' hides that, and only under
    //      box-sizing: border-box), and
    //   2. it moves the containing block for absolutely positioned children to
    //      the PADDING box.
    //
    // (2) is the one that bit: freeform children position themselves absolutely,
    // so a parent's 1px border drew every child one unit down-and-right of its
    // own rect — compounding with nesting depth — while the selection ring, snap
    // guides and drop highlights all kept using the model rect. The frame you
    // drew and the frame you saw no longer agreed. Outline never consumes space
    // and never shifts a child, so the DOM and the IR stay in the same
    // coordinate space by construction.
    //
    // The offset places the band against the border edge: -width sits it wholly
    // inside, -width/2 straddles it, 0 sits it wholly outside — Figma's three
    // stroke positions exactly.
    css.outline = `${width}px ${lineStyle} ${cssColor(color)}`
    css.outlineOffset =
      position === 'outside' ? 0 : position === 'center' ? `${-width / 2}px` : `${-width}px`
  }
  const radius = radiusValue(style.radius)
  if (radius !== undefined) css.borderRadius = radius
  if (style.opacity !== undefined) css.opacity = style.opacity
  if (style.clip) css.overflow = 'hidden'
  Object.assign(css, effectsCss(style, { text }))

  return css
}

/**
 * Position and intrinsic size for a node, given its PARENT's flow.
 *
 * Under an auto-layout parent the layout owns placement, exactly as in Figma, so
 * x/y are dropped entirely. That rule is what stops a free-form board from
 * emitting position:absolute soup: the moment a parent gains a flow, its
 * children's coordinates stop reaching the output.
 */
export function positionCss(
  rect: CanvasRect,
  parentFlow: CanvasStyle['flow'],
  style: CanvasStyle,
): CssProps {
  const css: CssProps = {}
  // An explicit style width/height wins over the drawn rect — that is how a
  // 'fill'/'hug' child stops being pinned to its last dragged size.
  if (style.w === undefined) css.width = rect.w
  if (style.h === undefined) css.height = rect.h

  if (!parentFlow || parentFlow === 'freeform') {
    css.position = 'absolute'
    css.left = rect.x
    css.top = rect.y
  } else {
    // A margin is part of how a layout spaces its children — it has no
    // meaning (and would only misplace the node) where the rect is the position.
    const margin = paddingValue(style.margin)
    if (margin !== undefined) css.margin = margin
  }
  // About the box's center — CSS's default transform-origin, and the point an
  // along-path layout centers each child on.
  if (style.rotate) css.transform = `rotate(${style.rotate}deg)`
  return css
}

/** Typography for a text node. Frame does not model text, so this stands alone. */
export function textCss(font: CanvasTextStyle | undefined): CssProps {
  const css: CssProps = {}
  if (!font) return css
  if (font.size !== undefined) css.fontSize = font.size
  if (font.weight !== undefined) css.fontWeight = font.weight
  if (font.mono) css.fontFamily = 'var(--font-mono)'
  if (font.color) css.color = cssColor(font.color)
  if (font.align) css.textAlign = font.align
  if (font.lineHeight !== undefined) css.lineHeight = font.lineHeight
  if (font.letterSpacing !== undefined) css.letterSpacing = font.letterSpacing
  return css
}

/** Merges style bags, later wins. Skips undefined so callers can pass gaps. */
export function mergeCss(...parts: (CssProps | undefined)[]): CssProps {
  return Object.assign({}, ...parts.filter(Boolean))
}
