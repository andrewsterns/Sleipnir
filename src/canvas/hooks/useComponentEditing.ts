// Canvas components and their variants: promoting frames to components, variant
// edits, approving a component into a real file and pushing changes to it. Split
// out of CanvasView.ViewModel.tsx; the view model passes in the board state it
// shares.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  bakeLayout,
  findNode,
  findParent,
  groupNodes,
  updateNode,
} from '../../document/doc'
import {
  addVariant,
  createComponentFromFrame,
  findComponent,
  flattenComponent,
  detachInstance,
  instancesOf,
  removeVariant,
  renameVariant,
  resolveVariant,
  setVariantRoot,
  updateComponent,
} from '../../document/variants'
import {
  hashContent,
  pruneEmptyFolder,
} from '../io/store'
import {
  createWorkspaceFile,
  deleteWorkspacePath,
  readWorkspaceFile,
  writeWorkspaceFile,
} from '../../platform/sleipnirApi'
import { collectImports, emitComponentFile, emitPropsInterface, emitRegionBody, emitSignature } from '../emit/react'
import { spliceDeclaration, spliceImports, spliceRegion } from '../emit/region'
import { boardFolderName, componentPathIn, deconflictComponentPath, folderFieldSeed, parentDir, resolveComponentPath } from '../../document/paths'
import {
  isFrameNode,
  isInstanceNode,
  isVectorNode,
  type CanvasDoc,
  type CanvasFrameNode,
  type CanvasComponent,
  type CanvasNode,
  type CanvasRect,
  type CanvasStyle,
  type CanvasTarget,
  type NodeId,
} from '../../document/types'
import { isVectorArt, editTargetOf } from '../boardEditing'

export interface ComponentEditingDeps {
  apply: (next: CanvasDoc, coalesce?: boolean) => void
  coalesceGesture: (gesture: string | undefined) => boolean
  doc: CanvasDoc | null
  editingTextId: string | null
  measured: ReadonlyMap<string, CanvasRect>
  selectedNodes: CanvasNode[]
  setEditingTextId: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  singleSelected: CanvasNode | null
}

export function useComponentEditing({ apply, coalesceGesture, doc, editingTextId, measured, selectedNodes, setEditingTextId, setSelectedIds, singleSelected }: ComponentEditingDeps) {

  /**
   * Promotes the selected frame into a main component, replacing it in place
   * with an instance — Figma's "Create component" — AND writes its file.
   *
   * Writing is not a separate approval step. A component's file lands in
   * `.canvas` (see document/paths.ts's DEFAULT_COMPONENT_ROOT), which is a staging
   * tier rather than build input, so there is nothing to protect the project
   * from and nothing to ask about. It becomes real code by being MOVED out of
   * `.canvas` in the Workspace tree, which is where the deliberate decision
   * actually lives now.
   *
   * The path is derived, never asked for, and de-conflicted against the board:
   * promoting two frames both left as "Frame" is routine and must not fail.
   *
   * Same commit-after-write atomicity the old approve flow had: the board is
   * only mutated once the file lands, so a failed write leaves the frame a
   * frame with nothing to undo.
   */
  /**
   * Promotes `frame` within `base` and writes its file — the shared half of
   * CREATE COMPONENT and MAKE SVG COMPONENT. `base` may already carry an edit
   * the promotion depends on (MAKE SVG COMPONENT groups loose vectors first);
   * the whole thing commits as one undo step once the file lands.
   */
  const promoteFrame = useCallback(
    async (
      base: CanvasDoc,
      frame: CanvasFrameNode,
      options?: { name?: string; target?: CanvasTarget; format?: CanvasComponent['format'] },
    ) => {
      const promoted = createComponentFromFrame(base, frame, options)
      const componentId = promoted.component.id
      const taken = promoted.doc.components.flatMap((c) => (c.filePath ? [c.filePath] : []))

      // Two rounds of de-confliction, because they cover different things. The
      // board knows the paths it owns; the retry covers a file on disk that no
      // board claims (a leftover from a deleted board, or one made by hand).
      // Every rejected path accumulates, or the next derivation would hand back
      // one already refused. Bounded so a pathological directory can't spin.
      const rejected: string[] = []
      // Components land in their board's folder: .components/<board>/<name>/.
      const board = boardFolderName(base.name)
      let safePath = deconflictComponentPath(promoted.component.componentRoot, promoted.component.name, taken, board)
      let hash = ''
      for (let attempt = 0; ; attempt += 1) {
        const ctx = {
          filePath: safePath,
          components: promoted.doc.components,
          filePathFor: (id: string) => findComponent(promoted.doc, id)?.filePath,
        }
        const regionBody = emitRegionBody(promoted.component, ctx)
        hash = hashContent(regionBody)
        const file = emitComponentFile(promoted.component, ctx, hash)
        try {
          await createWorkspaceFile(safePath, file.content)
          break
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          if (attempt >= 20 || !/already exists/i.test(message)) throw e
          rejected.push(safePath)
          safePath = deconflictComponentPath(
            promoted.component.componentRoot,
            promoted.component.name,
            [...taken, ...rejected],
            board,
          )
        }
      }

      apply(
        updateComponent(promoted.doc, componentId, {
          filePath: safePath,
          sync: 'live',
          lastWrittenHash: hash,
          ejectReason: undefined,
        }),
      )
      setSelectedIds(new Set([promoted.instanceId]))
      return componentId
    },
    [apply, setSelectedIds],
  )

  const promoteSelectedToComponent = useCallback(
    async (options?: { name?: string; target?: CanvasTarget }) => {
      if (!doc || !singleSelected || !isFrameNode(singleSelected)) return null
      return promoteFrame(doc, singleSelected, options)
    },
    [doc, singleSelected, promoteFrame],
  )

  /**
   * What MAKE SVG COMPONENT would promote, or null when the selection isn't
   * vector art: one or more vectors sharing a parent (grouped first), or a
   * single frame holding nothing but vectors and groups of them.
   */
  const svgCandidate = useMemo((): { kind: 'frame'; id: NodeId } | { kind: 'vectors'; ids: NodeId[] } | null => {
    if (!doc || selectedNodes.length === 0) return null
    if (selectedNodes.length === 1 && isFrameNode(selectedNodes[0])) {
      return isVectorArt(selectedNodes[0]) ? { kind: 'frame', id: selectedNodes[0].id } : null
    }
    if (!selectedNodes.every(isVectorNode)) return null
    const parents = new Set(selectedNodes.map((n) => findParent(doc, n.id)?.id ?? null))
    return parents.size === 1 ? { kind: 'vectors', ids: selectedNodes.map((n) => n.id) } : null
  }, [doc, selectedNodes])

  /**
   * Turns the selected vectors into an SVG component: a component whose file
   * is one <svg> of paths rather than a tree of divs (see emit/svg.ts). Loose
   * vectors are grouped first, so the group's box becomes the svg's canvas.
   * Variants, props and the `.canvas` file lifecycle are a component's like
   * any other.
   */
  const makeSvgComponent = useCallback(async () => {
    if (!doc || !svgCandidate) return null
    let base = doc
    let frame: CanvasNode | null
    let name: string
    if (svgCandidate.kind === 'frame') {
      // An SVG has no layout, so wherever a stack placed a child is where it
      // is drawn: bake the measured positions in before promoting.
      base = bakeLayout(doc, svgCandidate.id, measured)
      frame = findNode(base, svgCandidate.id)
      name = frame?.name ?? 'Icon'
    } else {
      const single = svgCandidate.ids.length === 1 ? findNode(doc, svgCandidate.ids[0]) : null
      name = single?.name ?? 'Icon'
      const grouped = groupNodes(doc, svgCandidate.ids, name, measured)
      if (!grouped.groupId) return null
      base = grouped.doc
      frame = findNode(base, grouped.groupId)
    }
    if (!frame || !isFrameNode(frame)) return null
    return promoteFrame(base, frame, { name, format: 'svg' })
  }, [doc, svgCandidate, measured, promoteFrame])

  /**
   * Promotes `frameId` AND writes its file, as one operation.
   *
   * The promotion is built in memory and only committed once the write lands,
   * so a rejected path (or an existing file) leaves the frame a frame with
   * nothing on the board to undo — the caller shows the reason and stays open.
   * That atomicity is the whole point: "Create component" opens a modal, and
   * until it is approved nothing has happened.
   */
  const promoteAndApproveComponent = useCallback(
    async (frameId: NodeId, input: { name: string; target: CanvasTarget; filePath: string }) => {
      if (!doc) return
      const frame = findNode(doc, frameId)
      if (!frame || !isFrameNode(frame)) return

      const promoted = createComponentFromFrame(doc, frame, { name: input.name, target: input.target })
      const componentId = promoted.component.id
      const safePath = resolveComponentPath(promoted.component.componentRoot, input.filePath)
      const ctx = {
        filePath: safePath,
        components: promoted.doc.components,
        filePathFor: (id: string) => findComponent(promoted.doc, id)?.filePath,
      }

      const regionBody = emitRegionBody(promoted.component, ctx)
      const hash = hashContent(regionBody)
      const file = emitComponentFile(promoted.component, ctx, hash)

      await createWorkspaceFile(safePath, file.content)

      apply(
        updateComponent(promoted.doc, componentId, {
          filePath: safePath,
          sync: 'live',
          lastWrittenHash: hash,
          ejectReason: undefined,
        }),
      )
      setSelectedIds(new Set([promoted.instanceId]))
    },
    [doc, apply, setSelectedIds],
  )

  const setInstanceVariant = useCallback(
    (instanceId: NodeId, variantId: string) => {
      if (!doc) return
      const instance = findNode(doc, instanceId)
      if (!instance || !isInstanceNode(instance)) return
      const component = findComponent(doc, instance.componentId)
      if (!component) return
      const variant = component.variants.find((v) => v.id === variantId)
      if (!variant) return
      apply(updateNode(doc, instanceId, { variantValues: { ...variant.values } }))
    },
    [doc, apply],
  )

  /** Steps to the next variant — the label's quick preview trigger. */
  const triggerNextVariant = useCallback(
    (instanceId: NodeId) => {
      if (!doc) return
      const instance = findNode(doc, instanceId)
      if (!instance || !isInstanceNode(instance)) return
      const component = findComponent(doc, instance.componentId)
      if (!component || component.variants.length < 2) return
      const current = resolveVariant(component, instance.variantValues)
      const index = component.variants.findIndex((v) => v.id === current.id)
      const next = component.variants[(index + 1) % component.variants.length]
      apply(updateNode(doc, instanceId, { variantValues: { ...next.values } }))
    },
    [doc, apply],
  )

  const addComponentVariant = useCallback(
    (componentId: string, name: string, fromVariantId?: string) => {
      if (!doc) return
      apply(addVariant(doc, componentId, name, fromVariantId))
    },
    [doc, apply],
  )

  const removeComponentVariant = useCallback(
    (componentId: string, variantId: string) => {
      if (!doc) return
      apply(removeVariant(doc, componentId, variantId))
    },
    [doc, apply],
  )

  const renameComponentVariant = useCallback(
    (componentId: string, variantId: string, name: string) => {
      if (!doc) return
      apply(renameVariant(doc, componentId, variantId, name))
    },
    [doc, apply],
  )

  const patchComponent = useCallback(
    (componentId: string, patch: Parameters<typeof updateComponent>[2]) => {
      if (!doc) return
      apply(updateComponent(doc, componentId, patch))
    },
    [doc, apply],
  )

  const replaceVariantRoot = useCallback(
    (componentId: string, variantId: string, root: Parameters<typeof setVariantRoot>[3]) => {
      if (!doc) return
      apply(setVariantRoot(doc, componentId, variantId, root))
    },
    [doc, apply],
  )

  /**
   * Restyles a component's variant root — the main component, which every
   * instance renders. This is how a component's paint changes after
   * promotion: the board has no separate main-component canvas, so the
   * inspector edits it from the selected instance. The file then shows dirty
   * and UPDATE COMPONENT writes the change.
   */
  const updateVariantRootStyle = useCallback(
    (componentId: string, variantId: string, patch: Partial<CanvasStyle>, gesture?: string, nodeId?: NodeId) => {
      if (!doc) return
      const variant = findComponent(doc, componentId)?.variants.find((v) => v.id === variantId)
      if (!variant) return
      // `nodeId` reaches past the root to one node inside the main component —
      // an SVG component's lone vector, whose paint IS the component's look.
      const target = nodeId ?? variant.root.id
      const restyle = (node: CanvasNode): CanvasNode =>
        node.id === target
          ? { ...node, style: { ...node.style, ...patch } }
          : isFrameNode(node)
            ? { ...node, children: node.children.map(restyle) }
            : node
      const root = restyle(variant.root) as CanvasFrameNode
      apply(setVariantRoot(doc, componentId, variantId, root), coalesceGesture(gesture && `variant:${variantId}:${target}:${gesture}`))
    },
    [doc, apply, coalesceGesture],
  )

  /**
   * Writes a component to disk for the first time.
   *
   * Every path goes through resolveComponentPath, so a write outside the
   * component root is refused rather than corrected. Uses createWorkspaceFile
   * (which throws on an existing path) rather than the upsert, so approving can
   * never silently overwrite a file that is already there.
   */
  const approveComponent = useCallback(
    async (componentId: string, input: { name: string; target: CanvasTarget; filePath: string }) => {
      if (!doc) return
      const component = findComponent(doc, componentId)
      if (!component) return

      const safePath = resolveComponentPath(component.componentRoot, input.filePath)
      const named: CanvasComponent = { ...component, name: input.name, target: input.target }
      const ctx = {
        filePath: safePath,
        components: doc.components.map((c) => (c.id === componentId ? named : c)),
        filePathFor: (id: string) => findComponent(doc, id)?.filePath,
      }

      // Hash the region body, then emit the file carrying that hash — so the
      // sentinel records exactly what we wrote and the self-echo guard works
      // from the very first write.
      const regionBody = emitRegionBody(named, ctx)
      const hash = hashContent(regionBody)

      if (!component.filePath) {
        // No file yet — a detached component, or one from a board written
        // before promotion started writing its own file.
        await createWorkspaceFile(safePath, emitComponentFile(named, ctx, hash).content)
      } else {
        // A file already exists, so this is a rename and/or a move, not a
        // creation. Emitting a fresh file would throw off createWorkspaceFile
        // AND discard anything a human wrote around the region, so the existing
        // content is carried over and only the canvas-owned spans are updated —
        // the rename reaches the exported symbol and its props interface
        // through spliceDeclaration.
        const { content } = await readWorkspaceFile(component.filePath)
        let next = spliceRegion(content, componentId, hash, regionBody) ?? content
        next = spliceDeclaration(next, emitPropsInterface(named), emitSignature(named))
        next = spliceImports(next, collectImports(named, ctx))

        if (safePath === component.filePath) {
          await writeWorkspaceFile(safePath, next)
        } else {
          // createWorkspaceFile, not the upsert, so a move can never silently
          // overwrite something already sitting at the destination.
          await createWorkspaceFile(safePath, next)
          await deleteWorkspacePath(component.filePath)
          await pruneEmptyFolder(parentDir(component.filePath))
        }
      }

      let next = updateComponent(doc, componentId, {
        name: input.name,
        target: input.target,
        filePath: safePath,
        sync: 'live',
        lastWrittenHash: hash,
        ejectReason: undefined,
      })
      // Instances still called what the component was called follow the
      // rename, so the layers list reads the component's new name; ones
      // somebody named themselves keep their own.
      for (const instance of instancesOf(doc, componentId)) {
        if (instance.name === component.name) next = updateNode(next, instance.id, { name: input.name })
      }
      apply(next)
    },
    [doc, apply],
  )

  /**
   * Renames a component from the properties panel's name field: the file, its
   * exported symbol and its instances follow (approveComponent). A component
   * still in the folder its old name derived moves to the new name's folder; one
   * filed somewhere deliberately stays there, under the new file name.
   */
  const renameComponent = useCallback(
    async (componentId: string, name: string) => {
      if (!doc) return
      const component = findComponent(doc, componentId)
      const trimmed = name.trim()
      if (!component || !trimmed || trimmed === component.name) return
      const board = boardFolderName(doc.name)
      const folder = folderFieldSeed(component.componentRoot, component.name, component.filePath, board)
      const { path, error } = componentPathIn(component.componentRoot, trimmed, folder, board)
      if (!path) throw new Error(error ?? 'That name gives no valid file path.')
      await approveComponent(componentId, { name: trimmed, target: component.target, filePath: path })
    },
    [doc, approveComponent],
  )

  /**
   * Re-syncs an already-approved component's file with its current canvas
   * state — the explicit "push" half of sync (see document/types.ts's
   * ComponentSyncState doc comment: nothing pushes automatically). Splices
   * only the canvas-owned region (emit/region.ts) so anything a human added
   * around it survives untouched.
   *
   * Returns 'pushed', 'unchanged' (nothing to push), or 'detached' (the
   * file's sentinel region is gone — a human removed it, so writing back in
   * would silently clobber whatever replaced it; the caller surfaces this
   * rather than the hook guessing). Deliberately doesn't touch `sync` on the
   * detached path — that state is reserved for a deliberate user action, not
   * an inference from a missing region.
   */
  const pushComponent = useCallback(
    async (componentId: string): Promise<'pushed' | 'unchanged' | 'detached'> => {
      if (!doc) return 'unchanged'
      const component = findComponent(doc, componentId)
      if (!component?.filePath) return 'unchanged'

      const ctx = {
        filePath: component.filePath,
        components: doc.components,
        filePathFor: (id: string) => findComponent(doc, id)?.filePath,
      }
      const regionBody = emitRegionBody(component, ctx)
      const hash = hashContent(regionBody)
      if (hash === component.lastWrittenHash) return 'unchanged'

      const { content } = await readWorkspaceFile(component.filePath)
      const spliced = spliceRegion(content, component.id, hash, regionBody)
      if (spliced === null) return 'detached'

      // The region is not the only canvas-owned span. The props interface, the
      // signature, and the imports all derive from the component too, and all
      // three go stale the moment a prop or an instance reference is added —
      // which, now that the file is written at promote time rather than after
      // the design settles, is the normal case rather than a corner one.
      // Splicing only the region would leave a body using `state` above a
      // signature that still reads `()`.
      const withDeclaration = spliceDeclaration(
        spliced,
        emitPropsInterface(component),
        emitSignature(component),
      )
      const next = spliceImports(withDeclaration, collectImports(component, ctx))

      await writeWorkspaceFile(component.filePath, next)
      apply(updateComponent(doc, componentId, { lastWrittenHash: hash }))
      return 'pushed'
    },
    [doc, apply],
  )

  /**
   * Components with a written file whose current canvas state no longer
   * matches what's on disk — drives the dirty indicator in the Inspector and
   * Layers panel, and whether a "Push changes" action is offered at all.
   */
  //
  // Emitting a component's code to hash it is the costliest thing a doc change
  // does, and a drag changes the doc every frame — while leaving every
  // component untouched. So each hash is cached against the component object
  // and the component list it was emitted with (instances name other
  // components), and the set keeps its identity while its contents don't
  // change, so the memoized layer rows reading it don't re-render either.
  const regionHashCache = useRef(new WeakMap<CanvasComponent, { components: CanvasComponent[]; hash: string }>())
  const lastDirty = useRef<Set<string>>(new Set())
  const dirtyComponentIds = useMemo(() => {
    if (!doc) return lastDirty.current
    const dirty = new Set<string>()
    for (const component of doc.components) {
      if (!component.filePath) continue
      let cached = regionHashCache.current.get(component)
      if (!cached || cached.components !== doc.components) {
        const ctx = {
          filePath: component.filePath,
          components: doc.components,
          filePathFor: (id: string) => findComponent(doc, id)?.filePath,
        }
        cached = { components: doc.components, hash: hashContent(emitRegionBody(component, ctx)) }
        regionHashCache.current.set(component, cached)
      }
      if (cached.hash !== component.lastWrittenHash) dirty.add(component.id)
    }
    const prev = lastDirty.current
    if (prev.size === dirty.size && [...dirty].every((id) => prev.has(id))) return prev
    lastDirty.current = dirty
    return dirty
  }, [doc])

  /** The component behind the current selection, when an instance is selected. */
  const selectedComponent = useMemo(() => {
    if (!doc || !singleSelected || !isInstanceNode(singleSelected)) return null
    return findComponent(doc, singleSelected.componentId)
  }, [doc, singleSelected])

  const selectedVariant = useMemo(() => {
    if (!selectedComponent || !singleSelected || !isInstanceNode(singleSelected)) return null
    return resolveVariant(selectedComponent, singleSelected.variantValues)
  }, [selectedComponent, singleSelected])

  /**
   * Whether the selected component can be dissolved back into a frame.
   *
   * Gated on instance count alone, not on the full lossless test: flattening a
   * component that DOES carry variants or props is exactly the case this
   * button exists for — the automatic downgrade deliberately refuses it, so a
   * human has to be able to say "do it anyway". What it can't do is dissolve
   * something with several instances, since there'd be no single place to
   * dissolve into.
   */
  // Text editing ends when its layer stops being the one selected thing —
  // clicking away, Escape, a delete, an undo that removes it.
  useEffect(() => {
    if (editingTextId && singleSelected?.id !== editingTextId) setEditingTextId(null)
  }, [editingTextId, setEditingTextId, singleSelected])
  const setTextContent = useCallback(
    (id: NodeId, text: string) => {
      if (!doc) return
      apply(updateNode(doc, editTargetOf(doc, id), { text } as Partial<CanvasNode>), coalesceGesture(`text:${id}`))
    },
    [doc, apply, coalesceGesture],
  )
  const endTextEdit = useCallback(() => setEditingTextId(null), [setEditingTextId])

  const canFlattenSelectedComponent = useMemo(() => {
    if (!doc || !selectedComponent) return false
    return instancesOf(doc, selectedComponent.id).length === 1
  }, [doc, selectedComponent])

  /**
   * The properties panel's "make this a plain frame again" button. The only
   * instance of a component dissolves the component too (flattenComponent);
   * one of several detaches just itself, so the others keep tracking it.
   */
  const unmakeSelectedComponent = useCallback(() => {
    if (!doc || !singleSelected || !isInstanceNode(singleSelected)) return
    apply(
      canFlattenSelectedComponent
        ? flattenComponent(doc, singleSelected.componentId)
        : detachInstance(doc, singleSelected.id),
    )
  }, [doc, singleSelected, canFlattenSelectedComponent, apply])
  return { promoteFrame, promoteSelectedToComponent, svgCandidate, makeSvgComponent, promoteAndApproveComponent, setInstanceVariant, triggerNextVariant, addComponentVariant, removeComponentVariant, renameComponentVariant, patchComponent, replaceVariantRoot, updateVariantRootStyle, approveComponent, renameComponent, pushComponent, dirtyComponentIds, selectedComponent, selectedVariant, setTextContent, endTextEdit, canFlattenSelectedComponent, unmakeSelectedComponent }
}
