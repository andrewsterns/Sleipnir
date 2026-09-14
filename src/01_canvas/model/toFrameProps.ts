// One-way adapter: CanvasStyle (the persisted, closed IR subset) → UIKit
// FrameProps (the ~80-prop React surface).
//
// This adapter is the whole reason the canvas needs no renderer of its own.
// iFrame.tsx is already a port of Figma's box model, so a frame drawn on the
// board renders through the exact same code path as the <Frame/> JSX the React
// emitter writes — WYSIWYG is guaranteed by construction rather than
// approximated by a second layout engine.
//
// Deliberately one-way. Going FrameProps → CanvasStyle would mean accepting
// values the IR can't represent (raw `style`, gradients, blend modes), which is
// exactly the leak CanvasStyle exists to prevent.

import type { FrameProps } from '../../app/UIKit/Frame/iFrame'
import type { CanvasStyle, CanvasTextStyle, ColorRef, Size } from './types'

/**
 * Frame resolves bare token ids ('bg-2') to var(--bg-2) itself, and passes
 * anything else (a literal '#rrggbb', an rgba() string) through — so a ColorRef
 * is already exactly what Frame wants and needs no translation.
 */
function color(ref: ColorRef): string {
  return ref
}

function size(value: Size | undefined): FrameProps['w'] {
  return value
}

export function toFrameProps(style: CanvasStyle): FrameProps {
  const props: FrameProps = {}

  // ── layout ──
  if (style.flow) props.flow = style.flow
  if (style.gap !== undefined) props.gap = style.gap
  if (style.padding !== undefined) props.padding = style.padding
  if (style.align) props.align = style.align
  if (style.justify) props.justify = style.justify
  // The IR stores a boolean; Frame takes the CSS keyword.
  if (style.wrap !== undefined) props.wrap = style.wrap ? 'wrap' : 'nowrap'
  if (style.cols !== undefined) props.cols = style.cols

  // ── sizing ──
  if (style.w !== undefined) props.w = size(style.w)
  if (style.h !== undefined) props.h = size(style.h)
  if (style.minW !== undefined) props.minW = style.minW
  if (style.maxW !== undefined) props.maxW = style.maxW
  if (style.minH !== undefined) props.minH = style.minH
  if (style.maxH !== undefined) props.maxH = style.maxH
  if (style.grow !== undefined) props.grow = style.grow

  // ── paint ──
  // The IR keeps a fill LIST (Figma's model) so gradients/images can land later
  // without a shape change; v1 authors at most one, and Frame accepts either a
  // single layer or an array.
  if (style.fills?.length) {
    const layers = style.fills.map((f) => ({ solid: color(f.color), ...(f.opacity !== undefined ? { opacity: f.opacity } : {}) }))
    props.fill = layers.length === 1 ? layers[0] : layers
  }
  if (style.stroke) {
    props.stroke = {
      color: color(style.stroke.color),
      width: style.stroke.width,
      ...(style.stroke.style ? { style: style.stroke.style } : {}),
      ...(style.stroke.position ? { position: style.stroke.position } : {}),
    }
  }
  if (style.radius !== undefined) {
    props.radius =
      typeof style.radius === 'number'
        ? style.radius
        : {
            topLeft: style.radius.tl,
            topRight: style.radius.tr,
            bottomRight: style.radius.br,
            bottomLeft: style.radius.bl,
          }
  }
  if (style.opacity !== undefined) props.opacity = style.opacity
  if (style.clip !== undefined) props.clipContent = style.clip
  if (style.shadow) {
    props.effects = {
      'drop-shadow': {
        x: style.shadow.x,
        y: style.shadow.y,
        blur: style.shadow.blur,
        spread: style.shadow.spread,
        color: color(style.shadow.color),
      },
    }
  }

  return props
}

/**
 * Positioning props for a child whose PARENT is `flow: 'freeform'`.
 *
 * Under an auto-layout parent (vertical/horizontal/grid) a child's rect.x/y is
 * not authoritative — the layout decides, exactly as in Figma — so this returns
 * only the size in that case and the inspector greys out X/Y. That rule is what
 * stops free-form authoring from emitting position:absolute soup: as soon as a
 * parent gains a flow, its children's coordinates stop being emitted.
 */
export function toPositionProps(
  rect: { x: number; y: number; w: number; h: number },
  parentFlow: CanvasStyle['flow'],
  style: CanvasStyle,
): FrameProps {
  const sized: FrameProps = {
    // An explicit style width/height wins over the drawn rect — that's how a
    // 'fill'/'hug' child stops being pinned to its last dragged size.
    w: style.w !== undefined ? size(style.w) : rect.w,
    h: style.h !== undefined ? size(style.h) : rect.h,
  }
  if (parentFlow && parentFlow !== 'freeform') return sized
  return { ...sized, absolute: true, x: rect.x, y: rect.y }
}

/** Text nodes carry their own typography, which Frame doesn't model. */
export function toTextStyle(font: CanvasTextStyle | undefined): React.CSSProperties {
  if (!font) return {}
  return {
    fontSize: font.size,
    fontWeight: font.weight,
    fontFamily: font.mono ? 'var(--font-mono)' : undefined,
    // A bare token needs wrapping here; Frame's own resolver isn't in play for
    // a plain CSS color property.
    color: font.color ? (font.color.startsWith('#') || font.color.includes('(') ? font.color : `var(--${font.color})`) : undefined,
    textAlign: font.align,
    lineHeight: font.lineHeight,
    letterSpacing: font.letterSpacing,
  }
}
