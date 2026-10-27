import { useEffect, useMemo, useState } from 'react'
import { loadDoc } from '../model/store'
import { normalizeRelPath } from '../model/paths'
import {
  isExternalNode,
  isFrameNode,
  type CanvasComponent,
  type CanvasDoc,
  type CanvasDocSummary,
  type CanvasNode,
} from '../model/types'

/**
 * A canvas component an external node points at, with the components of the
 * board that owns it — its variants may use those, and rendering it needs them.
 */
export interface LinkedComponent {
  component: CanvasComponent
  components: CanvasComponent[]
  /** The board the component lives on — where its main component is edited. */
  ownerDocId: string
  ownerName: string
}

/** Normalized workspace path → the canvas component written there. */
export type LinkedComponents = ReadonlyMap<string, LinkedComponent>

function externalPathsIn(nodes: CanvasNode[], out: Set<string>) {
  for (const node of nodes) {
    if (isExternalNode(node)) out.add(normalizeRelPath(node.filePath))
    if (isFrameNode(node)) externalPathsIn(node.children, out)
  }
}

/**
 * Resolves every external node on `doc` that points at a canvas component —
 * one pasted from another board (see model/clipboard.ts) — to that component,
 * loaded from the board that owns it, so it renders live instead of as a
 * placeholder. Re-resolves when the owning board's summary changes, so an edit
 * made over there shows up here on the next visit.
 */
export function useLinkedComponents(doc: CanvasDoc | null, docs: CanvasDocSummary[]): LinkedComponents {
  // Only the set of linked paths and their owners' versions matter — not every
  // drag frame of the open board.
  const key = useMemo(() => {
    if (!doc) return ''
    const paths = new Set<string>()
    externalPathsIn(doc.nodes, paths)
    for (const component of doc.components) {
      for (const variant of component.variants) externalPathsIn([variant.root], paths)
    }
    const parts: string[] = []
    for (const path of [...paths].sort()) {
      const owner = docs.find((d) => d.componentFilePaths.some((p) => normalizeRelPath(p) === path))
      if (owner) parts.push(`${path}\n${owner.id}\n${owner.id === doc.id ? '' : owner.updatedAt}`)
    }
    return parts.join('\n\n')
  }, [doc, docs])

  // The open board's own components are always current — never read back from disk.
  const ownComponents = doc?.components
  const ownId = doc?.id ?? ''
  const ownName = doc?.name ?? ''
  const [loaded, setLoaded] = useState<Map<string, LinkedComponent>>(new Map())

  useEffect(() => {
    let cancelled = false
    const entries = key ? key.split('\n\n').map((part) => part.split('\n')) : []
    const ownerIds = [...new Set(entries.map(([, ownerId]) => ownerId))].filter((id) => id !== doc?.id)
    Promise.all(ownerIds.map((id) => loadDoc(id).catch(() => null))).then((owners) => {
      if (cancelled) return
      const next = new Map<string, LinkedComponent>()
      for (const owner of owners) {
        if (!owner) continue
        for (const component of owner.components) {
          if (component.filePath) {
            next.set(normalizeRelPath(component.filePath), {
              component,
              components: owner.components,
              ownerDocId: owner.id,
              ownerName: owner.name,
            })
          }
        }
      }
      setLoaded(next)
    })
    return () => {
      cancelled = true
    }
    // doc.id is read only to skip loading the open board itself, which `key` already encodes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return useMemo(() => {
    const out = new Map(loaded)
    for (const component of ownComponents ?? []) {
      if (component.filePath) {
        out.set(normalizeRelPath(component.filePath), {
          component,
          components: ownComponents!,
          ownerDocId: ownId,
          ownerName: ownName,
        })
      }
    }
    return out
  }, [loaded, ownComponents, ownId, ownName])
}
