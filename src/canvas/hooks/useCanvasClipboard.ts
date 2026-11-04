// Copy, cut and paste on the board: layers (within and across boards, as links)
// and pasted images. Split out of CanvasView.ViewModel.tsx; the view model passes
// in the board state it shares.

import { useCallback, useEffect, useRef } from 'react'
import {
  type CanvasDocSummary,
  isFrameNode,
  type CanvasDoc,
  type CanvasFrameNode,
  type CanvasNode,
  type CanvasRect,
  type NodeId,
} from '../../document/types'
import type { PanZoomHandle } from './usePanZoom'
import {
  boardRectOf,
  createFrameNode,
  findNode,
  findParent,
  insertNode,
  setStyle,
} from '../../document/doc'
import {
  adaptForTarget,
  copyPayload,
  parseClipboard,
  serializeClipboard,
  unionRect,
  type CanvasClipboard,
} from '../io/clipboard'
import { useLinkedComponents } from './useLinkedComponents'
import { fileFromBase64, imageFileFromClipboard } from '../io/clipboardImage'
import { MAX_PASTED_IMAGE, imageFileSize } from '../boardEditing'

export interface CanvasClipboardDeps {
  apply: (next: CanvasDoc, coalesce?: boolean) => void
  deleteSelected: () => void
  doc: CanvasDoc | null
  docRef: React.MutableRefObject<CanvasDoc | null>
  docs: CanvasDocSummary[]
  importImageFile: (file: File) => Promise<string>
  measured: ReadonlyMap<string, CanvasRect>
  panZoom: PanZoomHandle
  selectedIds: Set<string>
  setError: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function useCanvasClipboard({ apply, deleteSelected, doc, docRef, docs, importImageFile, measured, panZoom, selectedIds, setError, setSelectedIds }: CanvasClipboardDeps) {
  //
  // Copy/cut/paste ride the browser's own clipboard events rather than
  // Ctrl+C/V keydowns, so a canvas payload lands on the system clipboard —
  // pasteable into another board or another window — and an image copied
  // anywhere else (a screenshot, a browser) arrives here as a file. See
  // io/clipboard.ts for how components survive the trip between boards.
  const linked = useLinkedComponents(doc, docs)
  /** Same-board pastes step down-right each time, like Ctrl+D, instead of stacking exactly on top. */
  const pasteCount = useRef(0)

  /** The board area on screen right now, in board space. */
  const viewportBoardRect = useCallback((): CanvasRect | null => {
    const container = panZoom.containerRef.current
    if (!container) return null
    const r = container.getBoundingClientRect()
    const tl = panZoom.toBoard(r.left, r.top)
    const br = panZoom.toBoard(r.right, r.bottom)
    return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y }
  }, [panZoom])

  /**
   * Whether the paste about to happen was Ctrl+Shift+V (into the selection)
   * rather than Ctrl+V (onto the board). A ClipboardEvent carries no modifier
   * keys, so the V keydown that triggers it records them — read in the capture
   * phase, before any input can stop it, and consumed by the paste. Tracking
   * Shift up/down instead could stick "on" when an input swallowed the keyup,
   * silently sending every later paste into the selected frame.
   */
  const pasteIntoSelection = useRef(false)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyV' && (e.ctrlKey || e.metaKey)) pasteIntoSelection.current = e.shiftKey
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  /**
   * Where pasted content goes. Ctrl+V: straight onto the board, whatever is
   * selected. Ctrl+Shift+V: into the selection — a selected frame receives it
   * (Figma's rule); a selected leaf — or a selected node that is itself what
   * was copied, which means "paste a copy next to it" — gets it as a sibling.
   * `into` says whether it's going INTO the selected frame, which centers it
   * there rather than keeping its own position.
   */
  const pasteTarget = useCallback(
    (current: CanvasDoc, copiedIds: Set<NodeId>, intoSelection: boolean): { parent: CanvasFrameNode | null; into: boolean } => {
      if (!intoSelection) return { parent: null, into: false }
      const selected = selectedIds.size === 1 ? findNode(current, [...selectedIds][0]) : null
      if (!selected) return { parent: null, into: false }
      if (isFrameNode(selected) && !copiedIds.has(selected.id)) return { parent: selected, into: true }
      return { parent: findParent(current, selected.id), into: false }
    },
    [selectedIds],
  )

  /**
   * Moves nodes whose rects are in BOARD space into place under `parent`,
   * keeping their arrangement: centered in the frame they're pasted into;
   * nudged off the original for a same-board paste that's still on screen;
   * centered on screen otherwise.
   */
  const placeNodes = useCallback(
    <T extends CanvasNode>(current: CanvasDoc, nodes: T[], parent: CanvasFrameNode | null, into: boolean, offset: number): T[] => {
      const box = unionRect(nodes.map((n) => n.rect))
      const parentBox = parent ? boardRectOf(current, parent.id, measured) : null
      let target = { x: box.x + offset, y: box.y + offset }
      const view = viewportBoardRect()
      const onScreen =
        !!view && target.x < view.x + view.w && target.x + box.w > view.x && target.y < view.y + view.h && target.y + box.h > view.y
      if (into && parentBox) {
        target = { x: parentBox.x + (parentBox.w - box.w) / 2, y: parentBox.y + (parentBox.h - box.h) / 2 }
      } else if ((offset === 0 || !onScreen) && view) {
        target = { x: view.x + (view.w - box.w) / 2, y: view.y + (view.h - box.h) / 2 }
      }
      const dx = target.x - box.x - (parentBox?.x ?? 0)
      const dy = target.y - box.y - (parentBox?.y ?? 0)
      return nodes.map((n) => ({ ...n, rect: { ...n.rect, x: Math.round(n.rect.x + dx), y: Math.round(n.rect.y + dy) } }))
    },
    [measured, viewportBoardRect],
  )

  const pasteNodes = useCallback(
    (payload: CanvasClipboard, intoSelection: boolean) => {
      const current = docRef.current
      if (!current) return
      const { nodes, components } = adaptForTarget(current, payload)
      const { parent, into } = pasteTarget(current, new Set(payload.nodes.map((n) => n.id)), intoSelection)
      const sameBoard = payload.sourceDocId === current.id
      if (sameBoard && !into) pasteCount.current += 1
      const placed = placeNodes(current, nodes, parent, into, sameBoard && !into ? 16 * pasteCount.current : 0)
      let next = components.length > 0 ? { ...current, components: [...current.components, ...components] } : current
      for (const node of placed) next = insertNode(next, node, parent?.id ?? null)
      apply(next)
      setSelectedIds(new Set(placed.map((n) => n.id)))
    },
    [apply, docRef, pasteTarget, placeNodes, setSelectedIds],
  )

  /**
   * A pasted image becomes a frame filled with it (Figma's image node is the
   * same thing: a rectangle with an image fill), so it crops when resized. It
   * lands on the board; with Ctrl+Shift+V it goes into a selected frame as a
   * child, and that frame starts clipping, so the image is cut to the frame's
   * shape — that's the point of pasting into one.
   */
  const pasteImage = useCallback(
    async (file: File, intoSelection: boolean) => {
      try {
        const [src, size] = await Promise.all([importImageFile(file), imageFileSize(file)])
        const current = docRef.current
        if (!current) return
        const scale = Math.min(1, MAX_PASTED_IMAGE / Math.max(size.w, size.h))
        const name = file.name && !/^image\.\w+$/.test(file.name) ? file.name.replace(/\.[^.]+$/, '') : 'Image'
        const frame = createFrameNode({ x: 0, y: 0, w: Math.round(size.w * scale), h: Math.round(size.h * scale) }, name)
        frame.style = { ...frame.style, fills: [{ type: 'image', src, scaleMode: 'fill', natural: size }], stroke: undefined, radius: undefined, clip: true }
        const { parent, into } = pasteTarget(current, new Set(), intoSelection)
        const [placed] = placeNodes(current, [frame], parent, into, 0)
        let next = insertNode(current, placed, parent?.id ?? null)
        if (into && parent && !parent.style.clip) next = setStyle(next, parent.id, { clip: true })
        apply(next)
        setSelectedIds(new Set([placed.id]))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [apply, docRef, importImageFile, pasteTarget, placeNodes, setError, setSelectedIds],
  )

  useEffect(() => {
    // Every visited view stays mounted (display:none when not shown), so only
    // the board actually on screen may claim the clipboard.
    const onScreen = () => !!panZoom.containerRef.current?.offsetParent
    const typing = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    const copy = (cut: boolean) => (e: ClipboardEvent) => {
      const current = docRef.current
      if (!onScreen() || typing(e.target) || !current || selectedIds.size === 0 || !e.clipboardData) return
      const payload = copyPayload(current, selectedIds, measured)
      if (!payload) return
      e.preventDefault()
      e.clipboardData.setData('text/plain', serializeClipboard(payload))
      pasteCount.current = 0
      if (cut) deleteSelected()
    }
    const onCopy = copy(false)
    const onCut = copy(true)
    const onPaste = (e: ClipboardEvent) => {
      if (!onScreen() || !docRef.current || !e.clipboardData) return
      const intoSelection = pasteIntoSelection.current
      pasteIntoSelection.current = false
      // An image file goes onto the board even while a text field has focus —
      // a text field can't take one anyway, so "Ctrl+V anywhere" works without
      // first clicking an empty spot of the board. Text (SVG code included)
      // and canvas nodes still paste into a focused field as usual.
      const image = imageFileFromClipboard(e.clipboardData, { markup: !typing(e.target) })
      if (image) {
        e.preventDefault()
        void pasteImage(image, intoSelection)
        return
      }
      if (typing(e.target)) return
      const payload = parseClipboard(e.clipboardData.getData('text/plain'))
      if (payload) {
        e.preventDefault()
        pasteNodes(payload, intoSelection)
        return
      }
      // Nothing the page can see — a file copied in Explorer/Finder usually
      // lands here. Ask the main process to read the clipboard natively.
      const readNative = window.electronAPI?.readClipboardImage
      if (readNative) {
        e.preventDefault()
        void readNative().then((native) => {
          const file = native && fileFromBase64(native.base64, native.name, native.mime)
          if (file) void pasteImage(file, intoSelection)
        })
      }
    }
    window.addEventListener('copy', onCopy)
    window.addEventListener('cut', onCut)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('cut', onCut)
      window.removeEventListener('paste', onPaste)
    }
  }, [panZoom, selectedIds, measured, deleteSelected, pasteNodes, pasteImage, docRef])
  return { linked }
}
