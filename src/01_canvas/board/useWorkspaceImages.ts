// Loads the workspace images a board's image fills point at, so the board can
// draw them.
//
// The renderer can't hand `url()` a workspace path — it is not served from
// anywhere — so each one is read once (as a data URL, see the backend's
// readWorkspaceImageDataUrl) and turned into a blob: URL. Blob URLs rather than
// the data URLs themselves because the style string is rebuilt on every
// render: a 2 MB data URL inlined into every node's style would be re-parsed
// on every frame of a drag.
//
// The emitter never comes here — it turns the same paths into imports.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readWorkspaceImageDataUrl } from '../../00_planning/api/sleipnirApi'
import { isAbsoluteImageSrc, type ImageUrlResolver } from '../model/paint'
import { childrenOf, type CanvasComponent, type CanvasDoc, type CanvasNode } from '../model/types'

/**
 * Every workspace (non-URL) image src the board uses, in its nodes and its
 * components — plus `extra` components drawn on it from other boards (see
 * useLinkedComponents).
 */
export function workspaceImageSrcs(doc: CanvasDoc | null, extra: CanvasComponent[] = []): string[] {
  if (!doc) return []
  const srcs = new Set<string>()
  const visit = (node: CanvasNode) => {
    for (const fill of node.style.fills ?? []) {
      if (fill.type === 'image' && fill.src.trim() && !isAbsoluteImageSrc(fill.src)) srcs.add(fill.src.trim())
    }
    for (const child of childrenOf(node)) visit(child)
  }
  doc.nodes.forEach(visit)
  for (const component of [...doc.components, ...extra]) for (const variant of component.variants) visit(variant.root)
  return [...srcs].sort()
}

export function useWorkspaceImages(doc: CanvasDoc | null, extra?: CanvasComponent[]): ImageUrlResolver {
  // Walked once per doc, not on every render — panning re-renders the view each frame.
  const key = useMemo(() => workspaceImageSrcs(doc, extra).join('\n'), [doc, extra])
  // src → blob URL, or null once a read failed (so it isn't retried every render).
  const [urls, setUrls] = useState<ReadonlyMap<string, string | null>>(new Map())
  const requested = useRef(new Set<string>())
  const mounted = useRef(true)
  const latest = useRef(urls)
  latest.current = urls

  // Blob URLs live until revoked; drop them with the board.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      for (const url of latest.current.values()) if (url) URL.revokeObjectURL(url)
    }
  }, [])

  // Each src is requested once for the board's lifetime. Loads are never
  // cancelled by a change in the list — a src that drops out and comes back
  // (undo) should find its image already there.
  useEffect(() => {
    for (const src of key ? key.split('\n') : []) {
      if (requested.current.has(src)) continue
      requested.current.add(src)
      readWorkspaceImageDataUrl(src)
        .then(async ({ dataUrl }) => URL.createObjectURL(await (await fetch(dataUrl)).blob()))
        .catch(() => null)
        .then((url) => {
          if (!mounted.current) {
            if (url) URL.revokeObjectURL(url)
            return
          }
          setUrls((prev) => new Map(prev).set(src, url))
        })
    }
  }, [key])

  return useCallback((src: string) => urls.get(src.trim()) ?? undefined, [urls])
}
