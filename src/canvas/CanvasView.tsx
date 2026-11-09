// The Canvas tab — a Figma-style board whose frames are designed against the
// same box model the emitted code uses (see document/toCss.ts).
//
// The Docs pane (panels/DocsPane.tsx) browses the project's `.research/`
// notes beside the board.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import { IconButton } from '../app/UIKit/IconButton/IconButton'
import { Icon } from '../app/UIKit/Icon/Icon'
import { DeletePathModal } from '../app/DesignSystem/DeletePathModal'
import { deleteWorkspacePath, deleteNote, planNodesUnderPath } from '../platform/sleipnirApi'
import { useFileStages } from '../planning/useFileStages'
import { usePlanNodeLinks } from '../planning/usePlanNodeLinks'
import type { GraphNode } from '../planning/graph/types'
import { CanvasBoard } from './board/CanvasBoard'
import { CanvasToolbar } from './board/CanvasToolbar'
import { CanvasInspector } from './panels/CanvasInspector'
import { CreateBar } from './panels/CreateBar'
import { sketchMenuItems } from './panels/sketchMenu'
import { DocsPane } from './panels/DocsPane'
import { CanvasLayersPanel, layerMatches } from './panels/CanvasLayersPanel'
import { SIDE_PANEL_W, SidebarHeader } from '../app/UIKit/SidebarHeader/SidebarHeader'
import { childrenOf, type CanvasNode } from '../document/types'
import { useCanvasViewModel } from './CanvasView.ViewModel'
import { useWorkspaceImages } from './board/useWorkspaceImages'
import { KIND_ICON, useBoardTabs } from './useBoardTabs'
import { KIND_NAMES, untitledName } from '../document/documentKind'
import { linkOfLayer } from '../document/placements'
import { brokenFeatures, partPlacementOf, partReading } from '../document/objects'
import { composePlacement } from '../document/placement'
import { sketchProblem } from '../modeling/scene3d/planeRefs'
import { ContextMenu } from '../app/UIKit/ContextMenu/ContextMenu'
import { useContextMenu } from '../app/UIKit/ContextMenu/useContextMenu'
import { WorkspaceTabStrip } from '../app/WorkspaceTabStrip/WorkspaceTabStrip'
import { TAB_ROW_H, TabPicker } from '../app/WorkspaceTabStrip/TabPicker'
import type { CanvasViewProps } from './iCanvasView'
import { Viewport3DBoundary } from '../modeling/viewport/Viewport3DBoundary'

// three.js and the 3D viewport load only when a board is first opened in 3D.
// A fresh lazy() per attempt: React remembers a failed import, so retrying
// the same one would only fail again.
const loadViewport3D = () => lazy(() => import('../modeling/viewport/Viewport3D'))

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }
// Shared with Planning's NODES panel, so the two side panels line up.
const PANEL_W = SIDE_PANEL_W
// Figma's properties panel is 240; the fill, gradient-stop and effect rows
// need the room for a color's text field to stay readable.
const INSPECTOR_W = 248
const DOCS_W = 260

const NO_SELECTION = new Set<string>()

/** The board, alone — or laid over the 3D scene behind it, for sketch mode in an environment. */
function OverScene({ scene, children }: { scene: React.ReactNode; children: React.ReactNode }) {
  if (!scene) return <>{children}</>
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0, height: '100%', display: 'flex' }}>
      <div style={{ position: 'absolute', inset: 0 }}>{scene}</div>
      {children}
    </div>
  )
}

export function CanvasView({
  activeProject,
  docsBrowserRef,
  pendingFocus,
  onFocusConsumed,
  onOpenFile,
  onShowInPlanning,
  onWorkspaceChanged,
}: CanvasViewProps) {
  const vm = useCanvasViewModel(activeProject?.path, { pendingFocus, onFocusConsumed, onFilesChanged: onWorkspaceChanged })
  // The document decides the view (src/canvas/LAYOUT.md): a Sketch is 2D; an
  // Environment is 3D, and 2D inside it is sketch mode. No switch between them.
  const in3d = vm.in3d
  // Sketch mode in an environment: the board lies over the scene, whose camera faces the sketch's
  // plane and follows the board's pan and zoom (modeling/viewport/SketchInScene.tsx).
  const sketchView = useMemo(() => {
    const open = vm.sketchMode
    if (!open || vm.kind !== 'environment' || !vm.present || !vm.doc) return null
    const placed = vm.present.nodes.find((n) => n.id === open.id)
    const flat = vm.doc.nodes.find((n) => n.id === open.id)
    if (!placed?.space || !flat) return null
    // A part moved as a whole carries its sketch's plane with it: sketch where the part now stands.
    const present = vm.present
    const part = [placed, ...childrenOf(placed)].map((n) => partPlacementOf(present, n.id)).find((p) => p)
    return { placement: part ? composePlacement(part, placed.space) : placed.space, origin: { x: flat.rect.x, y: flat.rect.y }, camera: vm.camera }
  }, [vm.sketchMode, vm.kind, vm.present, vm.doc, vm.camera])
  // The open document's ⋯ menu, beside the picker.
  const docMenu = useContextMenu<string>()
  // The 3D view is picking a face: for a new sketch (+ Sketch › On a face), or for a sketch whose face is gone (Re-pick face).
  const [pickFor, setPickFor] = useState<null | 'new' | string>(null)
  const pickingFace = pickFor !== null
  const setPickingFace = (on: boolean) => setPickFor(on ? 'new' : null)
  // The toolbox's 3D groups, the same in both views (board/toolbox.ts).
  const modeling = { states: vm.solidStates, onSolid: vm.applySolidTool, onStarter: vm.addStarter }
  const [Viewport3D, setViewport3D] = useState(loadViewport3D)
  // Vector layers anywhere on the board — what a sweep can follow.
  const vectorPaths = useMemo(() => {
    const out: { id: string; name: string }[] = []
    const visit = (nodes: CanvasNode[]) => {
      for (const n of nodes) {
        if (n.kind === 'vector') out.push({ id: n.id, name: n.name })
        visit(childrenOf(n))
      }
    }
    visit(vm.doc?.nodes ?? [])
    return out
  }, [vm.doc])
  const select3d = useCallback(
    (id: string | null, additive: boolean) => {
      if (id && additive) vm.toggleSelect(id)
      else vm.selectOnly(id)
    },
    [vm.toggleSelect, vm.selectOnly], // eslint-disable-line react-hooks/exhaustive-deps
  )
  // One image cache for the board and the inspector's fill swatches.
  const linkedComponents = useMemo(() => [...vm.linked.values()].map((l) => l.component), [vm.linked])
  const imageUrl = useWorkspaceImages(vm.doc, linkedComponents)
  const [showDocs, setShowDocs] = useState(false)
  const boardTabs = useBoardTabs(vm, activeProject?.path)
  // Sketches, then environments — each group in the list's own order, most recently edited first.
  const pickerItems = useMemo(
    () =>
      (['sketch', 'environment'] as const).flatMap((kind) =>
        vm.docs
          .filter((d) => d.kind === kind)
          .map((d) => ({ id: d.id, label: d.name, icon: KIND_ICON[kind], section: kind === 'sketch' ? 'Sketches' : 'Environments' })),
      ),
    [vm.docs],
  )
  const sketchCount = pickerItems.filter((i) => i.section === 'Sketches').length
  // What's broken in the open environment (src/canvas/LAYOUT.md): features whose sketch or path was
  // deleted, sketches whose face is gone, placements whose Sketch was deleted. Flagged, never deleted.
  const problems = useMemo(() => {
    const out = new Map<string, string>()
    const doc = vm.present
    if (!doc || vm.kind !== 'environment') return out
    for (const [id, why] of brokenFeatures(doc)) out.set(id, why)
    for (const node of doc.nodes) {
      const why = sketchProblem(doc, node)
      if (why) out.set(node.id, why)
      const link = node.sketch?.link
      if (link && !vm.loading && !vm.docs.some((d) => d.id === link.doc)) out.set(node.id, `The sketch it was placed from was deleted — this is its last copy`)
    }
    return out
  }, [vm.present, vm.kind, vm.docs, vm.loading])
  const sketchDocs = useMemo(() => vm.docs.filter((d) => d.kind === 'sketch'), [vm.docs])
  // A Sketch says which environments place it, so it can be found again from either side.
  const usedIn = useMemo(() => (vm.doc ? vm.docs.filter((d) => d.links?.includes(vm.doc!.id)) : []), [vm.docs, vm.doc])
  // Opening a placed sketch opens the Sketch it comes from: its layers are edited there, not here.
  const openSketch = useCallback((id: string) => {
    const placed = vmRef.current.present ? linkOfLayer(vmRef.current.present, id) : null
    if (placed) void vmRef.current.openDoc(placed.link.doc)
    else vmRef.current.enterPlaneEdit(id)
  }, [])
  const { stages: fileStages, setStatus: setFileStatus } = useFileStages()
  const planNodeLinks = usePlanNodeLinks()

  // A layers-panel "Delete" on the last instance of a written component —
  // set the moment that's chosen, so the confirm modal (with its file/plan-
  // node choice) appears before anything is actually removed.
  const [pendingDelete, setPendingDelete] = useState<{ nodeId: string; componentId: string; filePath: string } | null>(null)
  const [pendingDeletePlanNodes, setPendingDeletePlanNodes] = useState<GraphNode[]>([])

  useEffect(() => {
    if (!pendingDelete) {
      setPendingDeletePlanNodes([])
      return
    }
    let cancelled = false
    planNodesUnderPath(pendingDelete.filePath, false)
      .then((nodes) => { if (!cancelled) setPendingDeletePlanNodes(nodes) })
      .catch(() => { if (!cancelled) setPendingDeletePlanNodes([]) })
    return () => { cancelled = true }
  }, [pendingDelete])

  // Stable for the view's lifetime — reading the latest ViewModel through a
  // ref — so the memoized layer rows only re-render for layers that changed.
  // (The ViewModel's own callbacks change with every doc change, i.e. every
  // frame of a drag.)
  const layerCount = useMemo(() => {
    let n = 0
    const visit = (nodes: CanvasNode[]) => nodes.forEach((node) => { n += 1; visit(childrenOf(node)) })
    visit(vm.doc?.nodes ?? [])
    return n
  }, [vm.doc])

  const vmRef = useRef(vm)
  vmRef.current = vm
  const selectLayer = useCallback(
    (id: string, additive: boolean) => (additive ? vmRef.current.toggleSelect(id) : vmRef.current.selectOnly(id)),
    [],
  )
  const toggleLayerHidden = useCallback((id: string, hidden: boolean) => vmRef.current.updateNodeFields(id, { hidden }), [])
  const toggleLayerLocked = useCallback((id: string, locked: boolean) => vmRef.current.updateNodeFields(id, { locked }), [])

  const handleDeleteLayer = (nodeId: string) => {
    const decision = vm.describeLayerDelete(nodeId)
    if (!decision) return
    if (decision.kind === 'node') {
      vm.removeNode(nodeId)
      return
    }
    if (decision.filePath) {
      setPendingDelete({ nodeId, componentId: decision.componentId, filePath: decision.filePath })
      return
    }
    // Last instance of a component that was never written to a file — nothing
    // outside the board to cascade to, so just remove it directly.
    vm.removeComponent(decision.componentId)
  }

  if (!activeProject) {
    return (
      <Frame flow="vertical" grow align="center" justify="center" gap={16}>
        <span style={{ ...UI_FONT, fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.03em' }}>
          No project open
        </span>
        <span style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-3)' }}>
          Open a project from File to start a canvas.
        </span>
      </Frame>
    )
  }

  return (
    <Frame flow="vertical" grow w="fill" style={{ minHeight: 0 }}>
      {/* ── Body ── */}
      <Frame flow="horizontal" grow w="fill" style={{ minHeight: 0 }}>
        {/* Layers */}
        <Frame
          flow="vertical"
          style={{ width: PANEL_W, minWidth: PANEL_W, minHeight: 0 }}
          stroke={{ right: { color: 'border-1' } }}
        >
          {/* What's here — every sketch and environment, and the search for
              any layer — then the open document's layers. */}
          <Frame flow="horizontal" align="center" gap={4} shrink={0} minH={TAB_ROW_H} padding={{ left: 10, right: 6 }} stroke={{ bottom: { color: 'border-1' } }}>
            <TabPicker
              noun="Sketches, environments and layers"
              // Short enough for the closed field: the counts when there is one kind, the two words when there are both.
              summary={sketchCount === 0 ? `Environments (${vm.docs.length})` : sketchCount === vm.docs.length ? `Sketches (${sketchCount})` : 'Sketches & environments'}
              width="fill"
              icon="canvas"
              items={pickerItems}
              openIds={boardTabs.tabs.map((t) => t.id)}
              activeId={vm.doc?.id ?? null}
              onPick={(id) => void vm.openDoc(id)}
              // The panel's one search: typing also finds the open board's layers.
              search={(q) =>
                vm.doc
                  ? layerMatches(vm.doc, q).map((node) => ({
                      id: `layer:${node.id}`,
                      label: node.name,
                      icon: node.kind === 'instance' ? ('component' as const) : ('frame' as const),
                      meta: node.kind,
                      section: 'Layers',
                      onPick: () => vmRef.current.selectOnly(node.id),
                    }))
                  : []
              }
              create={[
                {
                  icon: KIND_ICON.sketch,
                  label: (q) => (q ? `New sketch “${q}”` : 'New sketch'),
                  onCreate: (q) => void vm.createBoard(q || untitledName('sketch', vm.docs.map((d) => d.name)), 'sketch'),
                },
                {
                  icon: KIND_ICON.environment,
                  label: (q) => (q ? `New environment “${q}”` : 'New environment'),
                  onCreate: (q) => void vm.createBoard(q || untitledName('environment', vm.docs.map((d) => d.name)), 'environment'),
                },
              ]}
            />
            {/* The open document's own actions, as Planning's ⋯ holds a plan's. */}
            {vm.doc && vm.kind && (
              <IconButton
                glyph="⋯"
                iconSize={16}
                textColor="var(--text-3)"
                title={`${KIND_NAMES[vm.kind]} actions`}
                onClick={(e) => docMenu.openFromButton(e, vm.doc!.id)}
              />
            )}
            {docMenu.menu && vm.kind && (
              <ContextMenu
                x={docMenu.menu.x}
                y={docMenu.menu.y}
                anchorEl={docMenu.menu.anchorEl}
                onClose={docMenu.close}
                items={[{ label: `Delete ${KIND_NAMES[vm.kind].toLowerCase()}`, destructive: true, onSelect: () => void vm.removeBoard(docMenu.menu!.data) }]}
              />
            )}
          </Frame>
          {/* + Sketch adds a sketch to an environment; a Sketch has no planes. */}
          {vm.doc && vm.kind === 'environment' && (
            <CreateBar
              onSketch={vm.createSketch}
              sketches={sketchDocs}
              onPlace={(id) => void vm.placeSketchFrom(id)}
              onPickFace={
                vm.present?.objects?.length
                  ? () => {
                      // Faces are picked in 3D; an open sketch closes on the way.
                      vm.exitPlaneEdit()
                      setPickingFace(true)
                    }
                  : undefined
              }
            />
          )}
          {vm.kind === 'sketch' && usedIn.length > 0 && (
            <div style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-3)', padding: '6px 12px', lineHeight: 1.5 }}>
              {`Used in ${usedIn.length} environment${usedIn.length === 1 ? '' : 's'}: `}
              {usedIn.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ', '}
                  <button type="button" onClick={() => void vm.openDoc(d.id)} title={`Open ${d.name}`} style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-2)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                    {d.name}
                  </button>
                </span>
              ))}
            </div>
          )}
          <SidebarHeader framed label={`Layers (${layerCount})`} />
          {vm.doc ? (
            <CanvasLayersPanel
              doc={vm.doc}
              planes={vm.kind === 'environment'}
              filteredTo={vm.sketchMode?.name ?? null}
              problems={problems}
              onRepickFeature={vm.repickFeature}
              onDeleteFeature={vm.deleteFeature}
              focusFeature={vm.focusFeature}
              onFocusFeature={vm.setFocusFeature}
              onMoveFeature={vm.reorderFeature}
              onDeletePart={vm.deletePart}
              sketchName={(id) => vm.docs.find((d) => d.id === id)?.name}
              selectedIds={vm.selectedIds}
              onSelect={selectLayer}
              onToggleHidden={toggleLayerHidden}
              onSetHidden={vm.setLayersHidden}
              onAddSketch={(plane) => vm.createSketch({ kind: 'default', plane })}
              onSetFeatureHidden={vm.setFeatureHidden}
              onOpenSketch={openSketch}
              onToggleLocked={toggleLayerLocked}
              dirtyComponentIds={vm.dirtyComponentIds}
              onPush={(componentId) => vm.pushComponent(componentId)}
              fileStages={fileStages}
              onSetStatus={(path, stage) => setFileStatus(path, stage).catch(() => {})}
              onDeleteLayer={handleDeleteLayer}
              planNodeLinks={planNodeLinks}
              onShowInWorkspace={onOpenFile}
              onShowInPlanning={onShowInPlanning}
            />
          ) : (
            <Frame grow />
          )}
        </Frame>

        <Frame flow="vertical" grow minW={0} style={{ minHeight: 0 }}>
          {/* ── Toolbar ── */}
          <Frame
            flow="horizontal"
            align="center"
            gap={0}
            w="fill"
            padding={{ top: 0, bottom: 0, left: 0, right: 10 }}
            // Same height as Planning's header row whether or not any tab is open.
            minH={TAB_ROW_H}
            stroke={{ bottom: { color: 'border-1' } }}
          >
            {/* The open boards, beside the layers panel — the picker that opens
                them sits at the top of that panel, as Planning's does. The tool
                picker floats over the board itself (see board/CanvasToolbar), so
                this row is tabs and view actions only. */}
            <WorkspaceTabStrip
              tabs={boardTabs.tabs}
              activeTabId={boardTabs.activeId ?? ''}
              onActivate={boardTabs.activate}
              onClose={boardTabs.close}
              onAddTab={(name) => void vm.createBoard(name, 'sketch')}
              addPlaceholder="sketch name"
              // Renames the open document; its folder in .components follows.
              onRename={(id, name) => {
                if (id === vm.doc?.id) vm.renameBoard(name)
              }}
            />

            {/* History and view controls — their own group, so the row itself
                can run gap-free and the tabs start exactly where Planning's do. */}
            <Frame flow="horizontal" align="center" gap={8} shrink={0}>
              <button
                type="button"
                onClick={vm.undo}
                disabled={!vm.canUndo}
                title="Undo (Ctrl+Z)"
                style={{ ...UI_FONT, fontSize: 11, background: 'transparent', border: 'none', color: vm.canUndo ? 'var(--text-2)' : 'var(--text-3)', cursor: vm.canUndo ? 'pointer' : 'default' }}
              >
                Undo
              </button>
              <button
                type="button"
                onClick={vm.redo}
                disabled={!vm.canRedo}
                title="Redo (Ctrl+Shift+Z)"
                style={{ ...UI_FONT, fontSize: 11, background: 'transparent', border: 'none', color: vm.canRedo ? 'var(--text-2)' : 'var(--text-3)', cursor: vm.canRedo ? 'pointer' : 'default' }}
              >
                Redo
              </button>

              <div style={{ width: 1, height: 16, background: 'var(--border-1)' }} />

              <button
                type="button"
                onClick={vm.fitView}
                title={in3d ? 'Frame everything in 3D (Ctrl+1)' : 'Zoom to fit (Ctrl+1)'}
                style={{ ...UI_FONT, fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}
              >
                Fit
              </button>
              {/* The board's zoom; the 3D view zooms by Ctrl + scroll and has no percent. */}
              {!in3d && <button
                type="button"
                onClick={vm.resetZoom}
                title="Reset zoom (Ctrl+0)"
                style={{ ...UI_FONT, fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', minWidth: 44, textAlign: 'right' }}
              >
                {Math.round(vm.zoom * 100)}%
              </button>}

              <div style={{ width: 1, height: 16, background: 'var(--border-1)' }} />

              <button
                type="button"
                onClick={() => setShowDocs((v) => !v)}
                title="Toggle the project's docs"
                style={{ ...UI_FONT, fontSize: 11, background: 'transparent', border: 'none', color: showDocs ? 'var(--text-1)' : 'var(--text-3)', cursor: 'pointer' }}
              >
                Docs
              </button>
            </Frame>
          </Frame>

          {vm.error && (
            <Frame
              flow="horizontal"
              align="center"
              gap={8}
              w="fill"
              padding={{ top: 4, bottom: 4, left: 10, right: 10 }}
              fill={{ solid: 'bg-2' }}
            >
              <span style={{ ...UI_FONT, fontSize: 11, color: '#e07a7a' }}>{vm.error}</span>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={vm.clearError}
                style={{ ...UI_FONT, fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}
              >
                Dismiss
              </button>
            </Frame>
          )}

          <Frame flow="horizontal" grow w="fill" style={{ minHeight: 0 }}>
            {/* Board */}
            {vm.loading ? (
              <Frame grow align="center" justify="center">
                <span style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-3)' }}>Loading…</span>
              </Frame>
            ) : vm.doc && in3d ? (
              <Frame grow minW={0} h="fill" style={{ position: 'relative' }}>
                <Viewport3DBoundary onRetry={() => setViewport3D(loadViewport3D)}>
                <Suspense
                  fallback={
                    <Frame grow align="center" justify="center" h="fill">
                      <span style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-3)' }}>Loading 3D…</span>
                    </Frame>
                  }
                >
                  <Viewport3D
                    doc={vm.present!}
                    selectedIds={vm.selectedIds}
                    onSelect={select3d}
                    onModal={vm.modal}
                    extrudeSignal={vm.extrudeSignal}
                    rectOf={vm.planeRect}
                    pickingFace={pickingFace}
                    onPickFace={(layerId, triangle) => {
                      // A new sketch on the picked face (opened in sketch mode), or a broken one standing there again. A click on a flat layer keeps picking.
                      const done = pickFor && pickFor !== 'new' ? vm.repickFace(pickFor, layerId, triangle) : vm.sketchOnFace(layerId, triangle)
                      if (!done) return false
                      setPickingFace(false)
                      return true
                    }}
                    onCancelPick={() => setPickingFace(false)}
                    gizmoMode={vm.gizmoMode}
                    fitSignal={vm.fit3d}
                    selectMode={vm.selectMode}
                    display={vm.display}
                    elements={vm.elements}
                    onPickElement={vm.pickElement}
                    onBoxSelect={vm.boxElements}
                  />
                </Suspense>
                </Viewport3DBoundary>
                {/* One toolbox (src/canvas/LAYOUT.md): in 3D, the shaping tools, starter shapes and transforms. */}
                <CanvasToolbar
                  view="3d"
                  tool="select"
                  onSelectTool={() => {}}
                  sketchMenu={sketchMenuItems({
                    onSketch: vm.createSketch,
                    onPickFace: vm.present?.objects?.length ? () => setPickingFace(true) : undefined,
                    sketches: sketchDocs,
                    onPlace: (id) => void vm.placeSketchFrom(id),
                  })}
                  modeling={modeling}
                  selectModes={{ mode: vm.selectMode, onMode: vm.setSelectMode }}
                  transform={{ mode: vm.gizmoMode, onMode: vm.setGizmoMode }}
                />
              </Frame>
            ) : vm.doc ? (
              <OverScene
                scene={
                  sketchView && (
                    <Viewport3DBoundary onRetry={() => setViewport3D(loadViewport3D)}>
                      <Suspense fallback={null}>
                        <Viewport3D doc={vm.present!} selectedIds={NO_SELECTION} onSelect={() => {}} rectOf={vm.planeRect} sketchView={sketchView} hideId={vm.sketchMode?.id} display={vm.display} />
                      </Suspense>
                    </Viewport3DBoundary>
                  )
                }
              >
              <CanvasBoard
                overScene={!!sketchView}
                // The toolbox's Edit points: on the one selected shape, or ending the edit in progress.
                editPoints={
                  vm.editingVectorId
                    ? { active: true, onToggle: vm.exitVectorEdit }
                    : vm.singleSelected?.kind === 'vector'
                      ? { active: false, onToggle: () => vm.enterVectorEdit(vm.singleSelected!.id) }
                      : undefined
                }
                doc={vm.doc}
                imageUrl={imageUrl}
                linked={vm.linked}
                // From state, not the ref: the screen-space chrome has to repaint
                // when the camera moves, and panning never changes the zoom level.
                camera={vm.camera}
                // Measured where an auto-layout parent owns the position, model-
                // derived elsewhere — so the selection ring lands on the frame it
                // names instead of on its stale model coordinates.
                rectOf={vm.rectOf}
                orientedOf={vm.orientedOf}
                quadOf={vm.quadOf}
                pathHint={vm.pathHint}
                selectedIds={vm.selectedIds}
                previewRect={vm.previewRect}
                previewKind={vm.dragKind === 'draw' || vm.dragKind === 'marquee' ? vm.dragKind : vm.dragKind === 'point-marquee' ? 'marquee' : null}
                pen={vm.pen}
                penCursor={vm.penCursor}
                vectorEdit={vm.vectorEdit}
                onPointPointerDown={vm.startPointDrag}
                insertPreview={vm.insertPreview}
                showHandles={(vm.dragKind === null || vm.dragKind === 'resize' || vm.dragKind === 'rotate' || vm.dragKind === 'path-slide') && !vm.editingVectorId}
                resizeHandles={vm.resizeHandles}
                containerRef={vm.panZoom.containerRef}
                viewportRef={vm.panZoom.viewportRef}
                onPointerDown={(e) => {
                  vm.panZoom.onPointerDown(e)
                  vm.onBoardPointerDown(e)
                }}
                onPointerMove={(e) => {
                  vm.panZoom.onPointerMove(e)
                  vm.onBoardPointerMove(e)
                }}
                onPointerUp={(e) => {
                  vm.panZoom.onPointerUp(e)
                  vm.onBoardPointerUp(e)
                }}
                onPointerLeave={vm.onBoardPointerLeave}
                onStartResize={vm.startResize}
                onStartRotate={vm.startRotate}
                onStartPathSlide={vm.startPathSlide}
                onStartMove={vm.startMoveDrag}
                onDoubleClick={vm.onBoardDoubleClick}
                editingTextId={vm.editingTextId}
                onTextChange={vm.setTextContent}
                onEndTextEdit={vm.endTextEdit}
                guides={vm.guides}
                planeGuides={vm.planeGuideLines}
                planeEditName={vm.sketchMode?.name ?? null}
                planeEditPlane={vm.sketchMode?.plane}
                // Over the scene, the real parts show behind; the flattened ghost is for a board on its own.
                sketchGhost={sketchView ? undefined : vm.sketchMode?.ghost}
                // A Sketch builds no parts: the 3D groups are an environment's (and its sketch mode's).
                modeling={vm.kind === 'environment' ? { states: modeling.states, onSolid: modeling.onSolid } : undefined}
                onExitPlaneEdit={vm.exitPlaneEdit}
                dropTargetId={vm.dropTargetId}
                dropIndicator={vm.dropIndicator}
                hoverId={vm.hoverId}
                crosshair={vm.tool !== 'select'}
                tool={vm.tool}
                onSelectTool={vm.setTool}
                onSelectInstanceVariant={vm.setInstanceVariant}
                onTriggerNextVariant={vm.triggerNextVariant}
                onOpenComponent={(componentId) => {
                  const instance = vm.doc?.nodes.find(
                    (n) => n.kind === 'instance' && n.componentId === componentId,
                  )
                  if (instance) vm.selectOnly(instance.id)
                }}
              />
              </OverScene>
            ) : (
              <Frame grow flow="vertical" align="center" justify="center" gap={12}>
                <span style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.03em' }}>
                  {vm.docs.length > 0 ? 'Nothing open — pick a sketch or environment from the list' : 'No sketches or environments yet'}
                </span>
                <Frame flow="horizontal" gap={8}>
                  {(['sketch', 'environment'] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => vm.createBoard(untitledName(kind, vm.docs.map((d) => d.name)), kind)}
                      style={{
                        ...UI_FONT,
                        fontSize: 11,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'var(--bg-2)',
                        border: '1px solid var(--border-1)',
                        borderRadius: 'var(--radius-control)',
                        color: 'var(--text-1)',
                        padding: '6px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon name={KIND_ICON[kind]} size={12} />
                      {'New ' + KIND_NAMES[kind].toLowerCase()}
                    </button>
                  ))}
                </Frame>
              </Frame>
            )}

            {/* Inspector */}
            <Frame
              flow="vertical"
              style={{ width: INSPECTOR_W, minWidth: INSPECTOR_W, minHeight: 0 }}
              stroke={{ left: { color: 'border-1' } }}
            >
              <SidebarHeader framed label="Properties" />
              <CanvasInspector
                node={vm.singleSelected}
                space3d={
                  vm.doc && vm.kind === 'environment'
                    ? {
                        doc: vm.doc,
                        topLevel: !!vm.singleSelected && vm.doc.nodes.some((n) => n.id === vm.singleSelected!.id),
                        paths: vectorPaths,
                        onPlacement: (id, placement, gesture) => vm.placeLayer(id, placement, gesture && `space:${gesture}`),
                        onPlane: (id, plane, gesture) => vm.setSketchPlane(id, plane, gesture && `plane:${gesture}`),
                        onSolid: (id, solid, gesture) => vm.setLayerSolid(id, solid, gesture && `solid:${gesture}`),
                        onFeature: vm.editFeature,
                        display: { mode: vm.display, onMode: vm.setDisplay },
                        problemOf: (id) => {
                          const why = problems.get(id)
                          if (!why) return null
                          return { why, onRepickFace: why.includes('face') || why.includes('part it stood') || why.includes('feature whose face') ? () => setPickFor(id) : undefined }
                        },
                        partOf: (id) => {
                          const found = vm.present ? partReading(vm.present, id) : null
                          if (!found) return null
                          const placed = found.object.placement
                          const moved = placed
                            ? `Moved as a whole: ${placed.position.map((v) => +v.toFixed(3)).join(', ')} m${placed.rotation.some((v) => v) ? ` · turned ${placed.rotation.map((v) => +v.toFixed(1)).join(', ')}°` : ''}${placed.scale ? ` · scaled ${placed.scale.map((v) => +v.toFixed(3)).join(', ')}×` : ''}`
                            : undefined
                          return { name: found.object.name, feature: found.feature.name, onRename: (name) => vm.renamePart(found.object.id, name), moved, onResetPlacement: placed ? () => vm.resetPartPlacement(found.object.id) : undefined }
                        },
                        featureOf: (id) => {
                          const found = vm.present ? partReading(vm.present, id) : null
                          if (!found) return null
                          const feature = found.object.features.find((f) => f.id === vm.focusFeature) ?? found.feature
                          return {
                            feature,
                            part: found.object,
                            pending: vm.featureDraft === feature.id,
                            onChange: (patch) => vm.draftFeature(feature.id, patch),
                            onDone: vm.finishFeature,
                            onRemove: () => vm.deleteFeature(feature.id),
                          }
                        },
                        linkedLayer: (id) => {
                          const placed = vm.present ? linkOfLayer(vm.present, id) : null
                          if (!placed) return null
                          return { sketch: vm.docs.find((d) => d.id === placed.link.doc)?.name ?? placed.node.name, onEdit: () => void vm.openDoc(placed.link.doc) }
                        },
                        linkOf: (id) => {
                          const placed = vm.present ? linkOfLayer(vm.present, id) : null
                          if (!placed || placed.node.id !== id) return null
                          const source = vm.docs.find((d) => d.id === placed.link.doc)
                          return {
                            name: source?.name ?? 'a sketch that is gone',
                            onOpen: () => void vm.openDoc(placed.link.doc),
                            onUnlink: () => vm.unlinkPlaced(id),
                          }
                        },
                      }
                    : undefined
                }
                linked={vm.selectedLinked}
                onLinkedPropChange={vm.setLinkedPropValue}
                onOpenMainComponent={(filePath) => void vm.openMainComponent(filePath)}
                onDetachLinked={vm.detachSelectedLinked}
                selectionCount={vm.selectedIds.size}
                parentFlow={vm.selectionParentFlow}
                pathPiece={vm.selectionPathPiece}
                arrange={{
                  canAlign: vm.canAlign,
                  canDistribute: vm.canDistribute,
                  canGroup: vm.canGroup,
                  canUngroup: vm.canUngroup,
                  onAlign: vm.alignSelected,
                  onDistribute: vm.distributeSelected,
                  onGroup: vm.groupSelected,
                  onUngroup: vm.ungroupSelected,
                  canPattern: vm.canPattern,
                  onPattern: vm.patternSelected,
                }}
                component={vm.selectedComponent}
                activeVariant={vm.selectedVariant}
                canPromote={vm.canPromote}
                onRename={(id, name) => vm.updateNodeFields(id, { name })}
                onRectChange={vm.updateSelectedRect}
                onStyleChange={vm.updateSelectedStyle}
                onFontChange={vm.updateNodeFont}
                onComponentStyleChange={vm.updateVariantRootStyle}
                onVectorChange={(id, patch, gesture) => vm.updateNodeFields(id, patch as never, gesture)}
                editingVectorId={vm.editingVectorId}
                pointSelection={vm.pointSelection}
                onPointType={vm.setSelectedPointType}
                onPointRadius={vm.setSelectedPointRadius}
                canMakeSvgComponent={vm.canMakeSvgComponent}
                onMakeSvgComponent={async () => {
                  try {
                    await vm.makeSvgComponent()
                    onWorkspaceChanged?.()
                  } catch (e) {
                    vm.setError(e instanceof Error ? e.message : String(e))
                  }
                }}
                imageUrl={imageUrl}
                images={vm.imageSources}
                // Promotion writes straight into `.canvas` with a derived path —
                // no modal, because a staging file needs no approval. Renaming or
                // relocating it is what the modal is for now, opened separately.
                onPromote={async () => {
                  try {
                    await vm.promoteSelectedToComponent()
                    onWorkspaceChanged?.()
                  } catch (e) {
                    vm.setError(e instanceof Error ? e.message : String(e))
                  }
                }}
                onRenameComponent={async (componentId, name) => {
                  await vm.renameComponent(componentId, name)
                  onWorkspaceChanged?.()
                }}
                isDirty={!!vm.selectedComponent && vm.dirtyComponentIds.has(vm.selectedComponent.id)}
                onPush={async (componentId) => {
                  const result = await vm.pushComponent(componentId)
                  // A missing sentinel region means a human removed it; writing back
                  // in would clobber whatever replaced it, so say so instead.
                  if (result === 'detached') {
                    vm.setError(
                      'That file no longer has a Sleipnir layout region — push skipped so nothing is overwritten.',
                    )
                  } else {
                    onWorkspaceChanged?.()
                  }
                }}
                onAddVariant={(name) => {
                  if (vm.selectedComponent) vm.addComponentVariant(vm.selectedComponent.id, name)
                }}
                onRemoveVariant={(variantId) => {
                  if (vm.selectedComponent) vm.removeComponentVariant(vm.selectedComponent.id, variantId)
                }}
                onRenameVariant={(variantId, name) => {
                  if (vm.selectedComponent) vm.renameComponentVariant(vm.selectedComponent.id, variantId, name)
                }}
                onSelectVariant={(variantId) => {
                  if (vm.singleSelected) vm.setInstanceVariant(vm.singleSelected.id, variantId)
                }}
                componentFolders={vm.doc?.componentFolders ?? []}
                // Returned, not awaited: the panel shows a rejected move (a path
                // that escapes the component root, a failed write) inline under
                // the field rather than as a board-level error.
                onSetPath={async (componentId, nextPath) => {
                  // No file yet (it was deleted outside Sleipnir): writing it is a
                  // fresh emit at that path, not a move.
                  const component = vm.doc?.components.find((c) => c.id === componentId)
                  if (component && !component.filePath) {
                    await vm.approveComponent(componentId, { name: component.name, target: component.target, filePath: nextPath })
                  } else {
                    await vm.setComponentPath(componentId, nextPath)
                  }
                  onWorkspaceChanged?.()
                }}
                boardFolder={vm.boardFolder}
                onUnmakeComponent={vm.unmakeSelectedComponent}
                canFlatten={vm.canFlattenSelectedComponent}
              />
            </Frame>

            {/* Docs — the project's own notes. */}
            {showDocs && (
              <Frame
                flow="vertical"
                style={{ width: DOCS_W, minWidth: DOCS_W, minHeight: 0 }}
                stroke={{ left: { color: 'border-1' } }}
              >
                <DocsPane ref={docsBrowserRef} activeProject={activeProject} />
              </Frame>
            )}
          </Frame>
        </Frame>
      </Frame>

      {pendingDelete && (
        <DeletePathModal
          path={pendingDelete.filePath}
          name={pendingDelete.filePath.split('/').pop()!}
          isDir={false}
          deletePath={deleteWorkspacePath}
          planNodes={pendingDeletePlanNodes}
          deletePlanNodes={async (ids) => { await Promise.all(ids.map((id) => deleteNote(id))) }}
          onClose={() => setPendingDelete(null)}
          onDeleted={() => {
            vm.removeComponent(pendingDelete.componentId)
            setPendingDelete(null)
          }}
        />
      )}
    </Frame>
  )
}
