// The canvas document IR — what a Canvas board serializes to
// (.canvas/.boards/<id>.json) and what every emitter reads from.
//
// ── Why there is no <Frame/> in Rust, Go, or anywhere else ──────────────────
//
// A frame is a DESIGN-TIME concept. Building a per-language <frame/> runtime
// would mean shipping a per-language *layout engine*, and a second layout
// engine guarantees the design-time pixel and the runtime pixel disagree —
// which is the failure mode that kills design-to-code tools. Instead: one IR,
// one design-time renderer, N pure emitters. Same seam as
// 00_planning/graph/templates/index.ts, which is already per-language string
// builders behind a switch — this is that seam with a richer input.
//
// The design-time renderer is UIKit's own <Frame>, because iFrame.tsx is
// already a port of Figma's box model (FlowType = freeform|vertical|horizontal
// |grid, DimensionProp = number|'fill'|'hug', Figma-position strokes, chamfer,
// clipContent, effects). So a frame drawn on the board and a frame emitted as
// <Frame flow="vertical" gap={8}/> run the SAME code path — WYSIWYG is exact
// and free, not approximated.
//
// ── The hard rule: CanvasStyle is hand-written, never derived ───────────────
//
// FrameProps extends Omit<React.HTMLAttributes<HTMLElement>, 'translate'>.
// A Pick<FrameProps, …> or a spread would let `style`, `className` and
// `onClick` into a persisted JSON document, which would silently destroy the
// language-agnostic property forever. Every field below is a number, a token
// id, or a member of a closed union. Adding one is a deliberate act that must
// be answerable in every emitter.

import type { LanguageId } from '../../00_planning/graph/architectures'

export type CanvasDocId = string
export type NodeId = string

/** Bumped only on a breaking shape change; loadDoc migrates forward. */
export const CANVAS_SCHEMA_VERSION = 1

// ── Scalars ────────────────────────────────────────────────────────────────

/**
 * A design-token id ('bg-2', 'text-1', 'border-1') or a literal '#rrggbb'.
 * Intent, not a CSS color — a non-CSS emitter must be able to map a token onto
 * its own theme system rather than inlining a hex value.
 */
export type ColorRef = string

/**
 * Figma sizing. A number is px. Mirrors iFrame.tsx's DimensionProp minus
 * 'screen' and the arbitrary-CSS-string escape hatch, both of which are
 * meaningless outside the DOM.
 */
export type Size = number | 'fill' | 'hug'

/** Mirrors iFrame.tsx's FlowType exactly. */
export type Flow = 'freeform' | 'vertical' | 'horizontal' | 'grid'

export type Align = 'start' | 'center' | 'end' | 'stretch'
export type Justify = 'start' | 'center' | 'end' | 'between' | 'around'

/**
 * A frame's "along a path" layout — its children are spaced along a curve
 * instead of stacked in a row or a grid. The curve is the frame's bottom-most
 * vector layer (a pen path, an ellipse for a ring, a polygon…); every other
 * child is centered on it in order. See model/pathFlow.ts.
 *
 * Unlike vertical/horizontal/grid this is NOT a CSS layout: the frame stays
 * `flow: 'freeform'`, and the layout writes each child's rect (and, with
 * `orient`, its rotation) into the document. So the board and the emitted code
 * both just see absolutely placed children — no runtime layout engine, in any
 * language, and WYSIWYG for free.
 */
export interface AlongPath {
  /**
   * `even` (default): the children share the whole path — ends included on an
   * open path, evenly round a closed one. `gap`: each child follows the last,
   * `style.gap` px apart edge to edge, starting at `offset`.
   */
  spacing?: 'even' | 'gap'
  /** Px along the path where the first child sits. Default 0. */
  offset?: number
  /** Rotate each child to follow the curve's direction. Default false. */
  orient?: boolean
  /**
   * Turns the frame into a PATTERN: its first child (after the guide) is
   * repeated this many times along the path — the count includes the
   * original — or as many times as fit, for `fill`. See model/pathPattern.ts.
   */
  repeat?: number | 'fill'
}

export interface Padding {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

// ── Style ──────────────────────────────────────────────────────────────────

// ── Paint ──────────────────────────────────────────────────────────────────
//
// Figma's paint model: a node carries a LIST of fills, painted bottom to top
// (fills[0] is the bottom layer, exactly as in Figma's API — the inspector
// shows the list reversed, topmost first, as Figma's panel does). Every paint
// has its own opacity, applied to that paint alone, never to the layer — layer
// opacity is CanvasStyle.opacity. `visible: false` is the eye toggle: the
// paint stays in the document and simply isn't drawn or emitted.
//
// All of it lowers to CSS backgrounds (see model/paint.ts), so the board and
// the emitted file still come from one derivation.

/** Shared by every paint. */
interface PaintBase {
  /** 0–1, applied to this paint only. Default 1. */
  opacity?: number
  /** The eye toggle. Default true. */
  visible?: boolean
}

/**
 * A flat color. `type` is optional so boards written before gradients existed
 * — `{ color, opacity }` and nothing else — read as exactly what they were.
 */
export interface SolidFill extends PaintBase {
  type?: 'solid'
  color: ColorRef
}

export interface GradientStop {
  /** 0–1 along the gradient. */
  position: number
  color: ColorRef
  /** 0–1, multiplied with the paint's own opacity. Default 1. */
  opacity?: number
}

/** A point or extent as fractions of the node's box, 0–1 on each axis. */
export interface UnitPoint {
  x: number
  y: number
}

export interface LinearGradientFill extends PaintBase {
  type: 'linear'
  /** Degrees, CSS convention: 0 runs bottom→top, 90 left→right, 180 top→bottom. */
  angle: number
  stops: GradientStop[]
}

export interface RadialGradientFill extends PaintBase {
  type: 'radial'
  /** Default the box's center. */
  center?: UnitPoint
  /** The ellipse's radii as fractions of the box. Default half of each side — touching every edge, Figma's default. */
  radius?: UnitPoint
  stops: GradientStop[]
}

/** Figma's "angular" gradient — a conic sweep around a center. */
export interface AngularGradientFill extends PaintBase {
  type: 'angular'
  /** Default the box's center. */
  center?: UnitPoint
  /** Degrees the sweep starts from, clockwise from 12 o'clock. Default 0. */
  angle?: number
  stops: GradientStop[]
}

/**
 * Figma's image scale modes. `fill` covers the box and crops (Figma's
 * default), `fit` letterboxes, `stretch` distorts to the box, `tile` repeats
 * at the image's natural size. (Figma's tile scale isn't modeled: CSS sizes a
 * background relative to the box, not to the image, so it couldn't be honored.)
 */
export type ImageScaleMode = 'fill' | 'fit' | 'stretch' | 'tile'

export interface ImageFill extends PaintBase {
  type: 'image'
  /**
   * A workspace-relative path (`.canvas/assets/hero.png`, `src/img/logo.svg`)
   * or an absolute URL (`https:` / `data:`). A path becomes a real `import` in
   * the emitted file, so the user's bundler resolves it like any other asset.
   */
  src: string
  scaleMode?: ImageScaleMode
  /**
   * The picture's own pixel size, recorded when it was imported — what "100%"
   * means in the inspector's scale field (see model/imageSizing.ts). Absent for
   * images added before this existed; the inspector measures those on demand.
   */
  natural?: { w: number; h: number }
}

export type GradientFill = LinearGradientFill | RadialGradientFill | AngularGradientFill
export type Fill = SolidFill | GradientFill | ImageFill
export type FillType = NonNullable<Fill['type']>

// ── Effects ────────────────────────────────────────────────────────────────

export interface ShadowEffect {
  type: 'drop-shadow' | 'inner-shadow'
  x: number
  y: number
  blur: number
  spread?: number
  color: ColorRef
  /** 0–1. Default 1 — Figma's default shadow gets its softness from a translucent color, so this is usually set. */
  opacity?: number
  visible?: boolean
}

export interface BlurEffect {
  /** `layer-blur` blurs the node itself; `background-blur` blurs what shows through it. */
  type: 'layer-blur' | 'background-blur'
  radius: number
  visible?: boolean
}

export type Effect = ShadowEffect | BlurEffect
export type EffectType = Effect['type']

export interface StrokeStyle {
  color: ColorRef
  width: number
  style?: 'solid' | 'dashed' | 'dotted'
  /** Figma stroke position; 'outside'/'center' don't consume layout space. */
  position?: 'inside' | 'center' | 'outside'
}

export interface CornerRadius {
  tl?: number
  tr?: number
  br?: number
  bl?: number
}

/** The single shadow boards carried before `effects` existed. Read as one drop shadow; never written any more. */
export interface ShadowStyle {
  x: number
  y: number
  blur: number
  spread?: number
  color: ColorRef
}

/**
 * The closed subset of Frame's box model the canvas can author. Deliberately
 * smaller than Frame's ~80 fields: video fills, glass/noise/texture effects,
 * blend modes and chamfer are reachable from hand-written code but not
 * authorable here.
 *
 * Gradients, image fills and Figma's four effects used to be on that list, on
 * the grounds that no non-CSS emitter could honor them. React is the only
 * emitter there is, and Figma parity is the point of the canvas, so they are
 * authorable now. A future emitter that genuinely can't paint one degrades it
 * (a gradient to its first stop, an image to nothing) rather than the canvas
 * refusing to let anyone draw it.
 */
export interface CanvasStyle {
  // layout
  flow?: Flow
  gap?: number
  padding?: number | Padding
  align?: Align
  justify?: Justify
  wrap?: boolean
  /** `grid` flow only. */
  cols?: number
  /**
   * Space this node keeps around itself — honored only under an auto-layout
   * parent (see toCss's positionCss): under a freeform parent the node sits at
   * its own rect, and a margin there would only shove it off the box the
   * selection ring is drawn from.
   */
  margin?: number | Padding
  /** Spaces the children along the frame's guide path. See AlongPath. */
  alongPath?: AlongPath

  // sizing
  w?: Size
  h?: Size
  minW?: number
  maxW?: number
  minH?: number
  maxH?: number
  grow?: boolean

  // paint — Figma's fill list, bottom to top (see Paint above)
  fills?: Fill[]
  stroke?: StrokeStyle
  radius?: number | CornerRadius
  /** Layer opacity — the whole node, children included. Each paint's own opacity is separate. */
  opacity?: number
  /**
   * Clockwise degrees about the node's own center — any layer, any kind. The
   * rect stays the UNROTATED box (rotating never rewrites x/y/w/h), and a
   * frame's children turn with it. Emitted as `transform: rotate()`, whose
   * default origin is that same center. See model/rotation.ts.
   */
  rotate?: number
  clip?: boolean
  /** Drop/inner shadows and blurs, in Figma's order. */
  effects?: Effect[]
  /** Legacy single shadow; superseded by `effects` and only read when `effects` is unset. */
  shadow?: ShadowStyle
}

/**
 * Board-space position for a root node, parent-space for a child.
 *
 * Honored ONLY when the parent's `flow === 'freeform'` (root nodes always
 * count as freeform). Under an auto-layout parent the position is computed by
 * the layout, exactly as in Figma — the inspector greys X/Y out in that case.
 * This is the rule that keeps free-form authoring from emitting
 * position:absolute soup: the moment a parent has a flow, its children's
 * coordinates stop being authoritative.
 */
export interface CanvasRect {
  x: number
  y: number
  w: number
  h: number
}

// ── Variables (props) ──────────────────────────────────────────────────────

export type CanvasPropType = 'string' | 'number' | 'boolean' | 'color' | 'enum' | 'node'

/** JSON-serializable prop value. `node` props hold no value in v1. */
export type CanvasPropValue = string | number | boolean | null

/**
 * A component's "variables" — the inspector's editable list AND the emitted
 * component's props interface. One concept, two renderings.
 *
 * Props live on a CanvasComponent, never on a loose frame: props only exist
 * where there is a function signature to put them in. Allowing them on loose
 * frames would leave the emitter with nowhere to write them.
 */
export interface CanvasProp {
  id: string
  /** Must be a valid identifier in the owning component's target; validated on entry. */
  name: string
  type: CanvasPropType
  defaultValue?: CanvasPropValue
  /** `enum` type only. */
  options?: string[]
  description?: string
  required?: boolean
}

// ── Nodes ──────────────────────────────────────────────────────────────────

export type CanvasNodeKind = 'frame' | 'text' | 'instance' | 'external' | 'vector'

export interface CanvasNodeBase {
  id: NodeId
  name: string
  kind: CanvasNodeKind
  rect: CanvasRect
  style: CanvasStyle
  /** Editor-only. Never emitted. */
  hidden?: boolean
  locked?: boolean
  /**
   * Set on a copy an along-path pattern made of the template with this id —
   * rebuilt from the template on every change, never edited on its own (see
   * model/pathPattern.ts).
   */
  repeatOf?: NodeId
  /**
   * Extra clockwise degrees for a piece on an along-path frame, on top of
   * where the path turns it (or on its own, without `orient`) — so each piece
   * can be spun freely while the path still places it. See model/pathFlow.ts.
   */
  pathTurn?: number
  /**
   * Left on a top-level node by something outside the app (an AI's /frame or
   * /component, via tools/agentSkills/vendor/canvas.mjs) for Sleipnir to act
   * on: bring it into view, and/or promote it to a component and write its
   * code. Consumed — removed — as soon as the board is open.
   */
  request?: { focus?: boolean; component?: { name?: string; format?: 'svg' } }
}

export interface CanvasFrameNode extends CanvasNodeBase {
  kind: 'frame'
  children: CanvasNode[]
}

export interface CanvasTextStyle {
  size?: number
  weight?: number
  mono?: boolean
  color?: ColorRef
  align?: 'left' | 'center' | 'right'
  lineHeight?: number
  letterSpacing?: number
}

export interface CanvasTextNode extends CanvasNodeBase {
  kind: 'text'
  text: string
  /**
   * When set, this text renders the value of the named prop on the nearest
   * owning component instead of `text`, and emits as `{props.name}`.
   */
  boundPropId?: string
  font?: CanvasTextStyle
}

/** A use of a canvas-defined component. Overrides are prop values only. */
export interface CanvasInstanceNode extends CanvasNodeBase {
  kind: 'instance'
  componentId: string
  /** Keyed by CanvasProp.id. Absent = the component's default. */
  overrides?: Record<string, CanvasPropValue>
  /**
   * Which variant this instance shows, keyed by variant-prop name — the same
   * shape as CanvasVariant.values. Absent = the default variant. Emits as
   * ordinary props on the call site (`<CardView state="hover" />`), because a
   * variant IS just a prop value once it reaches code.
   */
  variantValues?: Record<string, string>
}

/**
 * A component that already exists on disk in the open Workspace, dropped onto
 * the board.
 *
 * It renders as a labelled placeholder, not a live render — see the doc
 * comment on CanvasDoc for why live rendering is a later stage. The pixel is a
 * placeholder; the EMITTED CODE IS REAL (a true import plus a true call site),
 * which is the half that carries the user's actual intent.
 */
export interface CanvasExternalNode extends CanvasNodeBase {
  kind: 'external'
  /** Workspace-relative. */
  filePath: string
  /** The exported symbol used at the call site. */
  exportName: string
  /**
   * Best-effort parse of the component's own props (see model/propScan.ts).
   * Coarse by design — the same convention graph/importAdapters/detectEdges
   * already uses for import extraction.
   */
  knownProps?: CanvasProp[]
  propValues?: Record<string, CanvasPropValue>
}

// ── Vectors ────────────────────────────────────────────────────────────────

/**
 * Figma's shape tools plus the pen. Every one renders as SVG — on the board and
 * in the emitted file — rather than as a styled div: a circle or a triangle
 * isn't a box, and its fill, stroke and shadow have to follow the shape.
 */
export type VectorShape = 'rectangle' | 'ellipse' | 'polygon' | 'path'

/**
 * One anchor of a pen path, in the node's `viewBox` space. `in`/`out` are the
 * absolute positions of its bezier handles; absent means a sharp corner on
 * that side.
 */
export interface VectorPoint {
  x: number
  y: number
  in?: { x: number; y: number }
  out?: { x: number; y: number }
  /**
   * Rounds a SHARP anchor into a circular arc of this radius, in pixels — a
   * frame's corner radius, one point at a time. Honored where both segments
   * meeting at the anchor are straight; a smooth anchor is already round.
   */
  radius?: number
}

/**
 * A shape or pen path. Its geometry is derived from its rect (see
 * model/vector.ts), so resizing a vector scales it: a rectangle, ellipse or
 * polygon fills its box, and a path's points — stored in the `viewBox` it was
 * drawn in — stretch to it.
 *
 * Paint is the same `style` every node has: fills (as SVG paint — gradients
 * become <linearGradient>s, images <pattern>s), stroke, layer opacity and
 * effects. `radius` rounds a rectangle's corners.
 */
export interface CanvasVectorNode extends CanvasNodeBase {
  kind: 'vector'
  shape: VectorShape
  /** `polygon` only: how many sides. 3 is a triangle. */
  sides?: number
  /** `path` only. */
  points?: VectorPoint[]
  /** `path` only: whether the last point joins back to the first. */
  closed?: boolean
  /** `path` only: the space `points` are in — the path's bounds when it was drawn. */
  viewBox?: { w: number; h: number }
}

export type CanvasNode = CanvasFrameNode | CanvasTextNode | CanvasInstanceNode | CanvasExternalNode | CanvasVectorNode

// ── Emit targets ───────────────────────────────────────────────────────────

/**
 * Extract<> rather than an independent union, so these ids are provably a
 * subset of LanguageId and can be assigned straight into GraphNode.language /
 * ScaffoldEntry.language with no mapping table — keeping naming.ts's
 * extForLanguage / scaffoldFileName / languageForExt working unchanged.
 *
 * Only three of the nine LanguageIds can render a box without a framework
 * choice nobody has made. The others are listed in the dropdown but disabled,
 * with the reason shown inline — see CANVAS_TARGETS in emit/targets.ts.
 */
export type CanvasTarget = Extract<LanguageId, 'react' | 'html' | 'css'>

export interface CanvasTargetDef {
  id: LanguageId
  label: string
  available: boolean
  /** Shown in the disabled dropdown row. */
  unavailableReason?: string
}

// ── Component (main component) ─────────────────────────────────────────────

/**
 * One state of a component — Figma's variant. Selected by the values of the
 * component's variant props, e.g. `{ state: 'hover' }`.
 *
 * Each variant carries its OWN full tree, exactly as Figma does, rather than a
 * set of overrides against a base. That means editing shared structure means
 * editing each variant — a real cost, and the same one Figma has — but it avoids
 * an override-resolution engine, which is a large subsystem of its own and the
 * usual source of "why did my override disappear" bugs.
 */
export interface CanvasVariant {
  id: string
  /** Display name: 'Default', 'Hover', 'Disabled'. */
  name: string
  /** Variant-prop values that select this variant, keyed by CanvasProp.name. */
  values: Record<string, string>
  root: CanvasFrameNode
}

/**
 * How a component's canvas definition and its file on disk are kept in step.
 *
 * - `live`     — changes flow both ways automatically.
 * - `paused`   — linked, but neither side pushes; for making a big change undisturbed.
 * - `ejected`  — the file contains something the canvas can't represent (a `.map()`,
 *                a conditional, an arbitrary expression inside the owned region).
 *                The canvas stops pulling AND stops pushing: it will never
 *                overwrite code it does not understand. Recovering is an explicit
 *                user action (overwrite-from-canvas, or detach).
 * - `detached` — deliberately unlinked; the file is left alone forever.
 */
export type ComponentSyncState = 'live' | 'paused' | 'ejected' | 'detached'

/**
 * A reusable definition — Figma's "main component".
 *
 * This is the answer to "use that frame wherever we want": a component is
 * defined once, and every use is a CanvasInstanceNode holding only an id plus
 * overrides. That maps 1:1 onto code — the component emits one file, each
 * instance emits one `<Name … />` call site — and that alignment is the reason
 * the whole feature can work.
 */
export interface CanvasComponent {
  id: string
  name: string
  description?: string
  /**
   * Always at least one; `variants[0]` is the default and is the branch a
   * consumer gets when it passes no variant props.
   */
  variants: CanvasVariant[]
  props: CanvasProp[]
  /**
   * Ids of the props (all `type: 'enum'`) that discriminate variants. A subset
   * of `props`. Empty for a single-variant component.
   */
  variantPropIds: string[]
  target: CanvasTarget
  /**
   * What the component emits as. Absent is the default — divs, styled from
   * each frame's box (see emit/react.ts). `svg` is a vector component, made with
   * MAKE SVG COMPONENT: its root becomes one <svg> and every vector in it a
   * <path>, <rect>, <ellipse> or <polygon> inside it (see emit/svg.ts).
   */
  format?: 'svg'
  /** The sandbox this component's file must live inside. See model/paths.ts. */
  componentRoot: string
  /** Workspace-relative path of the real file, set once written. */
  filePath?: string
  sync: ComponentSyncState
  /** Why the component ejected — shown verbatim on the frame's badge. */
  ejectReason?: string
  /**
   * Hash of the canvas-owned region as last written by us. The self-echo guard:
   * a watcher event whose region hashes to this is our own write coming back.
   * A mismatch means someone else edited the file.
   */
  lastWrittenHash?: string
  createdAt: number
  updatedAt: number
}

// ── Document ───────────────────────────────────────────────────────────────

/**
 * One board, one JSON file under <workspace>/.canvas/.boards/.
 *
 * `nodes` are the loose frames on the infinite board; `components` are the
 * promoted, reusable definitions that instances point at. Promoting a frame
 * moves its subtree into `components` and leaves an instance behind at the
 * same rect — the operation Figma calls "Create component".
 */
export interface CanvasDoc {
  version: number
  id: CanvasDocId
  name: string
  nodes: CanvasNode[]
  components: CanvasComponent[]
  /**
   * Folders in the components tree that hold no component yet, relative to the
   * component root.
   *
   * Every folder that DOES contain a component is derived from that component's
   * filePath, so it needs no record here. This list exists only so a folder you
   * create up front survives a reload before anything has been put in it —
   * without it, "New folder" would vanish the moment the board was reopened.
   */
  componentFolders?: string[]
  /** Restored on reopen so a board lands where you left it. */
  camera?: { x: number; y: number; k: number }
  createdAt: number
  updatedAt: number
}

/** Enough to render the board list without loading every doc. */
export interface CanvasDocSummary {
  id: CanvasDocId
  name: string
  updatedAt: number
  /** filePath of every written component in this board — lets "which board has this file" be answered from the already-loaded doc list, no extra read. */
  componentFilePaths: string[]
}

// ── Narrowing helpers ──────────────────────────────────────────────────────

export function isFrameNode(node: CanvasNode): node is CanvasFrameNode {
  return node.kind === 'frame'
}

export function isTextNode(node: CanvasNode): node is CanvasTextNode {
  return node.kind === 'text'
}

export function isInstanceNode(node: CanvasNode): node is CanvasInstanceNode {
  return node.kind === 'instance'
}

export function isExternalNode(node: CanvasNode): node is CanvasExternalNode {
  return node.kind === 'external'
}

export function isVectorNode(node: CanvasNode): node is CanvasVectorNode {
  return node.kind === 'vector'
}

/** Only frames hold children; every other kind is a leaf. */
export function childrenOf(node: CanvasNode): CanvasNode[] {
  return isFrameNode(node) ? node.children : []
}
