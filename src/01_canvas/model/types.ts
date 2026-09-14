// The canvas document IR — what a Canvas board serializes to
// (.planning/canvas/<id>.json) and what every emitter reads from.
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

export interface Padding {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

// ── Style ──────────────────────────────────────────────────────────────────

export interface Fill {
  color: ColorRef
  opacity?: number
}

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

export interface ShadowStyle {
  x: number
  y: number
  blur: number
  spread?: number
  color: ColorRef
}

/**
 * The closed subset of Frame's box model the canvas can author. Deliberately
 * ~25 fields against Frame's ~80: gradients, video fills, glass/noise/texture
 * effects, blend modes and chamfer are all reachable from hand-written code but
 * are NOT authorable here, because no non-CSS emitter could honor them.
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

  // sizing
  w?: Size
  h?: Size
  minW?: number
  maxW?: number
  minH?: number
  maxH?: number
  grow?: boolean

  // paint — an array so Figma's fill list (gradients, images) can land later
  // without a shape change. v1 authors at most one.
  fills?: Fill[]
  stroke?: StrokeStyle
  radius?: number | CornerRadius
  opacity?: number
  clip?: boolean
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

export type CanvasNodeKind = 'frame' | 'text' | 'instance' | 'external'

export interface CanvasNodeBase {
  id: NodeId
  name: string
  kind: CanvasNodeKind
  rect: CanvasRect
  style: CanvasStyle
  /** Editor-only. Never emitted. */
  hidden?: boolean
  locked?: boolean
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

export type CanvasNode = CanvasFrameNode | CanvasTextNode | CanvasInstanceNode | CanvasExternalNode

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
 * One board, one JSON file under <workspace>/.planning/canvas/.
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

/** Only frames hold children; every other kind is a leaf. */
export function childrenOf(node: CanvasNode): CanvasNode[] {
  return isFrameNode(node) ? node.children : []
}
