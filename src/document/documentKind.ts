// The two kinds of canvas document (src/canvas/LAYOUT.md): a Sketch is 2D —
// frames, layers and components, Figma's file — and an Environment is 3D —
// sketches standing on planes and the parts built from them, Onshape's Part
// Studio. The kind decides how the document opens; there's no switching one
// document between 2D and 3D.
//
// Documents saved before the kinds existed don't say: they are read as an
// Environment if they hold anything 3D (a part, or a layer stood on a plane)
// and as a Sketch otherwise.

import type { CanvasDoc } from './types'

export type DocumentKind = 'sketch' | 'environment'

/** What a document is: what it says, or, for one saved before kinds, what its contents make it. */
export function documentKindOf(doc: Pick<CanvasDoc, 'kind' | 'objects' | 'nodes'>): DocumentKind {
  if (doc.kind) return doc.kind
  const in3d = (doc.objects?.length ?? 0) > 0 || doc.nodes.some((n) => n.space || n.sketch)
  return in3d ? 'environment' : 'sketch'
}

/** A document's kind written down, so it stays what it is whatever is later added or removed. Returns `doc` itself when it already says. */
export function withKind(doc: CanvasDoc): CanvasDoc {
  return doc.kind ? doc : { ...doc, kind: documentKindOf(doc) }
}

/** The document's kind in words: "Sketch", "Environment". */
export const KIND_NAMES: Record<DocumentKind, string> = { sketch: 'Sketch', environment: 'Environment' }

/**
 * A new document's name when none is typed: "Untitled sketch", "Untitled
 * environment" — numbered past any already taken, so two never share a tab
 * name and a placed sketch never reads "Untitled from Untitled".
 */
export function untitledName(kind: DocumentKind, taken: Iterable<string>): string {
  const base = `Untitled ${KIND_NAMES[kind].toLowerCase()}`
  const names = new Set(taken)
  if (!names.has(base)) return base
  let n = 2
  while (names.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}
