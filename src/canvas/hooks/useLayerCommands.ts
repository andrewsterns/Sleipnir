// Commands on the selected layers: group, pattern along a path, align and
// distribute, duplicate, select the parent, and delete — layers, components and
// their files. Split out of CanvasView.ViewModel.tsx.

import { useCallback, useMemo } from 'react'
import {
  isLayoutPositioned,
} from '../../document/layout'
import {
  boardRectOf,
  findNode,
  findParent,
  groupNodes,
  insertNode,
  setRect,
  ungroupNode,
} from '../../document/doc'
import {
  alignOffsets,
  distributeOffsets,
  type AlignMode,
  type DistributeMode,
} from '../../document/align'
import {
  deleteComponent,
  findComponent,
  flattenComponent,
  instancesOf,
  isLosslessDowngrade,
  updateComponent,
  cloneTree,
} from '../../document/variants'
import {
  pruneEmptyFolder,
} from '../io/store'
import {
  createWorkspaceFile,
  deleteWorkspacePath,
  readWorkspaceFile,
} from '../../platform/sleipnirApi'
import { parentDir, relativeToRoot, resolveComponentPath } from '../../document/paths'
import { isStagedPath, pruneUnreferencedComponents } from '../io/stagedFiles'
import { makePathPattern, pathAndPiece } from '../../document/pathPattern'
import { addComponentFolder } from '../../document/componentTree'
import {
  type CanvasDoc,
  type CanvasNode,
  type CanvasRect,
  type NodeId,
} from '../../document/types'
import { deletePiece } from '../boardEditing'

export interface LayerCommandsDeps {
  apply: (next: CanvasDoc, coalesce?: boolean) => void
  doc: CanvasDoc | null
  measured: ReadonlyMap<string, CanvasRect>
  selectedIds: Set<string>
  selectedNodes: CanvasNode[]
  setScopeId: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  singleSelected: CanvasNode | null
}

export function useLayerCommands({ apply, doc, measured, selectedIds, selectedNodes, setScopeId, setSelectedIds, singleSelected }: LayerCommandsDeps) {

  const groupSelected = useCallback(() => {
    if (!doc || selectedIds.size < 1) return
    const result = groupNodes(doc, [...selectedIds], 'Group', measured)
    if (!result.groupId) return
    apply(result.doc)
    setSelectedIds(new Set([result.groupId]))
  }, [doc, selectedIds, measured, apply, setSelectedIds])

  /** Two siblings, one of which can be a path: what "Pattern along path" can act on. */
  const canPattern = useMemo(() => {
    if (!doc || selectedNodes.length !== 2) return false
    const [a, b] = selectedNodes
    return findParent(doc, a.id)?.id === findParent(doc, b.id)?.id && pathAndPiece(selectedNodes) !== null
  }, [doc, selectedNodes])

  /** Wraps the selected path and piece into a pattern (document/pathPattern.ts's makePathPattern). */
  const patternSelected = useCallback(() => {
    if (!doc || !canPattern) return
    const result = makePathPattern(doc, selectedNodes.map((n) => n.id), measured)
    if (!result.frameId) return
    apply(result.doc)
    setSelectedIds(new Set([result.frameId]))
  }, [doc, canPattern, selectedNodes, measured, apply, setSelectedIds])

  const ungroupSelected = useCallback(() => {
    if (!doc || !singleSelected) return
    const result = ungroupNode(doc, singleSelected.id, measured)
    if (result.childIds.length === 0) return
    apply(result.doc)
    setSelectedIds(new Set(result.childIds))
  }, [doc, singleSelected, measured, apply, setSelectedIds])

  /**
   * Aligns the selection. Offsets are computed in board space then applied as
   * deltas to each node's own (parent-relative) rect, which keeps the operation
   * correct for a selection spread across different parents.
   */
  const alignSelected = useCallback(
    (mode: AlignMode) => {
      if (!doc || selectedIds.size < 2) return
      // Only nodes that can actually be repositioned: under an auto-layout
      // parent the flow decides alignment, so writing x/y here would move the
      // ring and nothing else.
      const ids = [...selectedIds].filter((id) => !isLayoutPositioned(doc, id))
      if (ids.length < 2) return
      const rects = ids.map((id) => boardRectOf(doc, id, measured)).filter((r): r is CanvasRect => r !== null)
      if (rects.length !== ids.length) return
      const offsets = alignOffsets(rects, mode)
      let next = doc
      ids.forEach((id, i) => {
        const node = findNode(next, id)
        if (!node) return
        next = setRect(next, id, { x: node.rect.x + offsets[i].dx, y: node.rect.y + offsets[i].dy })
      })
      apply(next)
    },
    [doc, selectedIds, apply, measured],
  )

  const distributeSelected = useCallback(
    (mode: DistributeMode) => {
      if (!doc || selectedIds.size < 3) return
      const ids = [...selectedIds].filter((id) => !isLayoutPositioned(doc, id))
      if (ids.length < 3) return
      const rects = ids.map((id) => boardRectOf(doc, id, measured)).filter((r): r is CanvasRect => r !== null)
      if (rects.length !== ids.length) return
      const offsets = distributeOffsets(rects, mode)
      let next = doc
      ids.forEach((id, i) => {
        const node = findNode(next, id)
        if (!node) return
        next = setRect(next, id, { x: node.rect.x + offsets[i].dx, y: node.rect.y + offsets[i].dy })
      })
      apply(next)
    },
    [doc, selectedIds, apply, measured],
  )

  /** Duplicates the selection, offset slightly so the copy is visible. */
  const duplicateSelected = useCallback(() => {
    if (!doc || selectedIds.size === 0) return
    let next = doc
    const created: NodeId[] = []
    for (const id of selectedIds) {
      const node = findNode(doc, id)
      if (!node) continue
      const parent = findParent(doc, id)
      const copy = cloneTree({ ...node, rect: { ...node.rect, x: node.rect.x + 16, y: node.rect.y + 16 } })
      next = insertNode(next, copy, parent?.id ?? null)
      created.push(copy.id)
    }
    if (created.length === 0) return
    apply(next)
    setSelectedIds(new Set(created))
  }, [doc, selectedIds, apply, setSelectedIds])

  /** Moves the selection up to its parent — Escape's "select less" behavior. */
  const selectParent = useCallback(() => {
    if (!doc || !singleSelected) return false
    const parent = findParent(doc, singleSelected.id)
    if (!parent) return false
    setSelectedIds(new Set([parent.id]))
    setScopeId(findParent(doc, parent.id)?.id ?? null)
    return true
  }, [doc, setScopeId, setSelectedIds, singleSelected])

  // ── Node operations ──
  //
  // Both deletes prune whatever components they leave without an instance:
  // deleting a component's last use IS deleting the component, and the staged
  // file sync above then takes its `.canvas` file too — one undo step for both.
  const deleteSelected = useCallback(() => {
    if (!doc || selectedIds.size === 0) return
    let next = doc
    for (const id of selectedIds) next = deletePiece(next, id)
    apply(pruneUnreferencedComponents(next))
    setSelectedIds(new Set())
  }, [doc, selectedIds, apply, setSelectedIds])

  /** Removes one node by id, regardless of the current selection — for the layers panel's own delete action, which targets whatever was right-clicked. */
  const removeNode = useCallback(
    (id: NodeId) => {
      if (!doc) return
      apply(pruneUnreferencedComponents(deletePiece(doc, id)))
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    },
    [doc, apply, setSelectedIds],
  )

  /** Removes a component and every instance of it — see document/variants.ts's deleteComponent. */
  const removeComponent = useCallback(
    (componentId: string) => {
      if (!doc) return
      apply(deleteComponent(doc, componentId))
    },
    [doc, apply],
  )

  /**
   * Deletes a component's file from the workspace, and un-promotes the
   * component when doing so costs nothing.
   *
   * Since promotion always writes a file, "a component with no file" is no
   * longer a state the ladder has a rung for — it is what a frame is. So when
   * the component is structurally a frame anyway (one variant, no props, one
   * instance) this dissolves it back into one, which is what deleting its only
   * reason to exist means.
   *
   * Anything richer is kept and marked detached instead. Variants, props and
   * the link between several instances are real work that a frame cannot hold,
   * and this runs behind a single click with no undo once the board autosaves —
   * so the expensive case waits for someone to ask for it explicitly (see
   * flattenComponent).
   *
   * Still deliberately separate from removeComponent: "stop shipping this as
   * code" and "delete this design" remain different intentions, and neither of
   * this function's two outcomes deletes the design.
   *
   * A STAGED file is the exception to keeping a file-less component: in
   * `.canvas` the file and the component are one thing (io/stagedFiles.ts),
   * so removing the file flattens the component — variants and props included,
   * since the undo step now brings back both the component and its file. The
   * staged-file sync does the actual delete. With several instances there is
   * no single frame to become, so that case is refused rather than detached.
   */
  const removeComponentFile = useCallback(
    async (componentId: string) => {
      if (!doc) return
      const component = findComponent(doc, componentId)
      if (!component?.filePath) return

      if (isStagedPath(component.filePath)) {
        const uses = instancesOf(doc, componentId).length
        if (uses > 1) {
          throw new Error(
            `${component.name} is used ${uses} times on this board — delete the other instances first, so it has one frame to turn back into.`,
          )
        }
        // No instance at all is a component an older build stranded; there is
        // nothing to flatten into, only the definition to drop.
        apply(uses === 1 ? flattenComponent(doc, componentId) : deleteComponent(doc, componentId))
        return
      }

      await deleteWorkspacePath(component.filePath)
      await pruneEmptyFolder(parentDir(component.filePath))

      if (isLosslessDowngrade(doc, componentId)) {
        apply(flattenComponent(doc, componentId))
        return
      }
      apply(
        updateComponent(doc, componentId, {
          filePath: undefined,
          lastWrittenHash: undefined,
          sync: 'detached',
          ejectReason: 'Its file was deleted. The design is still here — flatten it to a frame, or write it again.',
        }),
      )
    },
    [doc, apply],
  )

  /**
   * Dissolves a component back into a plain frame on request.
   *
   * The explicit half of the rule above: what removeComponentFile does on its
   * own only when nothing would be lost, offered as a decision when something
   * would. Refuses when there isn't exactly one instance, since there would be
   * no single place to dissolve into.
   */
  const flattenComponentToFrame = useCallback(
    (componentId: string) => {
      if (!doc) return
      apply(flattenComponent(doc, componentId))
    },
    [doc, apply],
  )

  /**
   * Retargets where a component's file lives.
   *
   * With no file yet this only records the intent. With a file on disk it is a
   * real move: the content is copied to the new path and the old file deleted,
   * so the region (and any human code around it) travels intact. Always
   * re-contained, so a hand-typed path can never place a file outside the
   * component root.
   */
  const setComponentPath = useCallback(
    async (componentId: string, nextPath: string) => {
      if (!doc) return
      const component = findComponent(doc, componentId)
      if (!component) return
      const safePath = resolveComponentPath(component.componentRoot, nextPath)
      if (safePath === component.filePath) return

      if (component.filePath) {
        const { content } = await readWorkspaceFile(component.filePath)
        await createWorkspaceFile(safePath, content)
        await deleteWorkspacePath(component.filePath)
      }
      apply(updateComponent(doc, componentId, { filePath: component.filePath ? safePath : undefined }))
      // A component with no file yet has nowhere to record a path, so the
      // pending target rides on the folder list instead and is picked up by the
      // Create Component modal's default.
      if (!component.filePath) {
        const folder = safePath.split('/').slice(0, -1).join('/')
        const relative = relativeToRoot(component.componentRoot, folder)
        if (relative) apply({ ...doc, componentFolders: addComponentFolder(doc, relative), updatedAt: Date.now() })
      }
    },
    [doc, apply],
  )
  return { groupSelected, canPattern, patternSelected, ungroupSelected, alignSelected, distributeSelected, duplicateSelected, selectParent, deleteSelected, removeNode, removeComponent, removeComponentFile, flattenComponentToFrame, setComponentPath }
}
