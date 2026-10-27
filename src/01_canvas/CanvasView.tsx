// The Canvas tab — a Figma-style board whose frames are designed against the
// same box model the emitted code uses (see model/toFrameProps.ts).
//
// Replaces the old Research tab, which was a thin FolderBrowserView wrapper
// over `.research/`. Those docs aren't lost: the Docs pane below is that exact
// same browser, now living beside the board instead of owning a whole tab.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import { IconButton } from '../app/UIKit/IconButton/IconButton'
import { DeletePathModal } from '../app/DesignSystem/DeletePathModal'
import { deleteWorkspacePath, deleteNote, planNodesUnderPath } from '../00_planning/api/sleipnirApi'
import { useFileStages } from '../00_planning/useFileStages'
import { usePlanNodeLinks } from '../00_planning/usePlanNodeLinks'
import type { GraphNode } from '../00_planning/graph/types'
import { ResearchView } from '../01_research/ResearchView'
import { DEFAULT_COMPONENT_ROOT } from './model/paths'
import { CanvasBoard } from './board/CanvasBoard'
import { CanvasInspector } from './panels/CanvasInspector'
import { CanvasLayersPanel, layerMatches } from './panels/CanvasLayersPanel'
import { SIDE_PANEL_W, SidebarHeader } from '../app/UIKit/SidebarHeader/SidebarHeader'
import { Search } from '../app/UIKit/Search/Search'
import { childrenOf, type CanvasNode } from './model/types'
import { CreateComponentModal } from './panels/CreateComponentModal'
import type { ComponentDraft } from './panels/CreateComponentModal'
import { useCanvasViewModel } from './CanvasView.ViewModel'
import { useWorkspaceImages } from './board/useWorkspaceImages'
import { useBoardTabs } from './useBoardTabs'
import { WorkspaceTabStrip } from '../app/WorkspaceTabStrip/WorkspaceTabStrip'
import { TAB_ROW_H, TabPicker } from '../app/WorkspaceTabStrip/TabPicker'
import type { CanvasViewProps } from './iCanvasView'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
// Shared with Planning's NODES panel, so the two side panels line up.
const PANEL_W = SIDE_PANEL_W
// Figma's properties panel is 240; the fill, gradient-stop and effect rows
// need the room for a color's text field to stay readable.
const INSPECTOR_W = 248
const DOCS_W = 260

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
  // One image cache for the board and the inspector's fill swatches.
  const linkedComponents = useMemo(() => [...vm.linked.values()].map((l) => l.component), [vm.linked])
  const imageUrl = useWorkspaceImages(vm.doc, linkedComponents)
  const [showDocs, setShowDocs] = useState(false)
  const boardTabs = useBoardTabs(vm, activeProject?.path)
  // Which already-written component the Create Component modal is open over.
  //
  // It no longer has a "promote" mode: promotion writes its own file into
  // `.canvas` with a derived path (see the ViewModel's
  // promoteSelectedToComponent), so there is no longer an unwritten in-between
  // state for a modal to approve. What's left is renaming, retargeting and
  // relocating a component that already exists.
  const [pendingWrite, setPendingWrite] = useState<{ componentId: string } | null>(null)

  // Field seeds only — the modal commits nothing itself.
  const pendingDraft = useMemo((): ComponentDraft | null => {
    if (!pendingWrite) return null
    const component = vm.doc?.components.find((c) => c.id === pendingWrite.componentId)
    return component
      ? {
          name: component.name,
          target: component.target,
          componentRoot: component.componentRoot,
          filePath: component.filePath,
        }
      : null
  }, [pendingWrite, vm.doc])

  // Folders the inspector's WORKSPACE PATH field offers as completions: every
  // folder that already holds a component file (workspace-relative, so
  // unambiguous), plus the board's recorded folders — including empty ones,
  // which exist only as records. Expressed against the selected component's own
  // root, since that's the only component whose path this panel edits.
  const folderOptions = useMemo(() => {
    const root = vm.selectedComponent?.componentRoot ?? DEFAULT_COMPONENT_ROOT
    const dirs = new Set<string>([root])
    for (const folder of vm.doc?.componentFolders ?? []) dirs.add(`${root}/${folder}`)
    for (const component of vm.doc?.components ?? []) {
      const filePath = component.filePath
      if (filePath?.includes('/')) dirs.add(filePath.slice(0, filePath.lastIndexOf('/')))
    }
    return [...dirs].sort()
  }, [vm.doc, vm.selectedComponent])

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
  // ── Layer search (same pattern as Planning's node search) ──
  const [layerSearchOpen, setLayerSearchOpen] = useState(false)
  const [layerQuery, setLayerQuery] = useState('')
  const [layerHighlightId, setLayerHighlightId] = useState<string | null>(null)
  const layerSearchRef = useRef<HTMLElement>(null)
  const layerCount = useMemo(() => {
    let n = 0
    const visit = (nodes: CanvasNode[]) => nodes.forEach((node) => { n += 1; visit(childrenOf(node)) })
    visit(vm.doc?.nodes ?? [])
    return n
  }, [vm.doc])
  const layerListItems = useMemo(
    () => (vm.doc ? layerMatches(vm.doc, layerQuery).map((node) => ({ id: node.id, onSelect: () => vmRef.current.selectOnly(node.id) })) : []),
    [vm.doc, layerQuery],
  )
  // A click anywhere else closes an empty search, as Planning's does. The list
  // rows are excluded: picking a match keeps the search where it is.
  useEffect(() => {
    if (!layerSearchOpen || layerQuery) return
    const onMouseDown = (e: MouseEvent) => {
      if (layerSearchRef.current?.contains(e.target as Node)) return
      setLayerSearchOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [layerSearchOpen, layerQuery])

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
        <span style={{ ...MONO, fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
          No project open
        </span>
        <span style={{ ...MONO, fontSize: 10, color: 'var(--text-3)' }}>
          Open a project from File to start a canvas.
        </span>
      </Frame>
    )
  }

  return (
    <Frame flow="vertical" grow w="fill" style={{ minHeight: 0 }}>
      {/* ── Toolbar ── */}
      <Frame
        flow="horizontal"
        align="center"
        gap={0}
        w="fill"
        padding={{ top: 0, bottom: 0, left: 10, right: 10 }}
        // Same height as Planning's header row whether or not any tab is open.
        minH={TAB_ROW_H}
        stroke={{ bottom: { color: 'border-1' } }}
      >
        {/* Every board on the left, the open ones as tabs beside it — the
            same pattern as Planning's plans. The tab strip's "+" names and
            creates a board. The tool picker floats over the board itself (see
            board/CanvasToolbar), so this row is boards and view actions only. */}
        {/* Picker + the open board's own action, grouped exactly like
            Planning's (WorkspaceHeader's leading slot): same gap, same icon. */}
        <Frame flow="horizontal" align="center" gap={4} shrink={0} padding={{ right: 4 }}>
        <TabPicker
          noun="Boards"
          icon="canvas"
          items={vm.docs.map((d) => ({ id: d.id, label: d.name }))}
          openIds={boardTabs.tabs.map((t) => t.id)}
          activeId={vm.doc?.id ?? null}
          onPick={(id) => void vm.openDoc(id)}
          create={{
            icon: 'file-add',
            label: (q) => (q ? `New board “${q}”` : 'New board'),
            onCreate: (q) => void vm.createBoard(q || 'Untitled'),
          }}
        />
        {vm.doc && (
          <IconButton
            icon="trash"
            iconSize={13}
            textColor="var(--text-3)"
            title="Delete this board"
            onClick={() => vm.removeBoard(vm.doc!.id)}
          />
        )}
        </Frame>
        <WorkspaceTabStrip
          tabs={boardTabs.tabs}
          activeTabId={boardTabs.activeId ?? ''}
          onActivate={boardTabs.activate}
          onClose={boardTabs.close}
          onAddTab={(name) => void vm.createBoard(name)}
          addPlaceholder="board name"
        />

        {/* History and view controls — their own group, so the row itself
            can run gap-free and the tabs start exactly where Planning's do. */}
        <Frame flow="horizontal" align="center" gap={8} shrink={0}>
          <button
            type="button"
            onClick={vm.undo}
            disabled={!vm.canUndo}
            title="Undo (Ctrl+Z)"
            style={{ ...MONO, fontSize: 10, background: 'transparent', border: 'none', color: vm.canUndo ? 'var(--text-2)' : 'var(--text-3)', cursor: vm.canUndo ? 'pointer' : 'default' }}
          >
            UNDO
          </button>
          <button
            type="button"
            onClick={vm.redo}
            disabled={!vm.canRedo}
            title="Redo (Ctrl+Shift+Z)"
            style={{ ...MONO, fontSize: 10, background: 'transparent', border: 'none', color: vm.canRedo ? 'var(--text-2)' : 'var(--text-3)', cursor: vm.canRedo ? 'pointer' : 'default' }}
          >
            REDO
          </button>

          <div style={{ width: 1, height: 16, background: 'var(--border-1)' }} />

          <button
            type="button"
            onClick={vm.zoomToFit}
            title="Zoom to fit (Ctrl+1)"
            style={{ ...MONO, fontSize: 10, background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}
          >
            FIT
          </button>
          <button
            type="button"
            onClick={vm.resetZoom}
            title="Reset zoom (Ctrl+0)"
            style={{ ...MONO, fontSize: 10, background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', minWidth: 44, textAlign: 'right' }}
          >
            {Math.round(vm.zoom * 100)}%
          </button>

          <div style={{ width: 1, height: 16, background: 'var(--border-1)' }} />

          <button
            type="button"
            onClick={() => setShowDocs((v) => !v)}
            title="Toggle the project's .research docs"
            style={{ ...MONO, fontSize: 10, background: 'transparent', border: 'none', color: showDocs ? 'var(--text-1)' : 'var(--text-3)', cursor: 'pointer' }}
          >
            DOCS
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
          <span style={{ ...MONO, fontSize: 10, color: '#e07a7a' }}>{vm.error}</span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={vm.clearError}
            style={{ ...MONO, fontSize: 10, background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}
          >
            DISMISS
          </button>
        </Frame>
      )}

      {/* ── Body ── */}
      <Frame flow="horizontal" grow w="fill" style={{ minHeight: 0 }}>
        {/* Layers */}
        <Frame
          flow="vertical"
          style={{ width: PANEL_W, minWidth: PANEL_W, minHeight: 0 }}
          stroke={{ right: { color: 'border-1' } }}
        >
          {/* Same docked-panel header as Planning's NODES — search slides over
              the title and the list flattens to the matches. */}
          <Frame ref={layerSearchRef} shrink={0}>
            <SidebarHeader
              framed
              label={`LAYERS (${layerCount})`}
              searchOpen={layerSearchOpen || !!layerQuery}
              actions={
                !layerSearchOpen && !layerQuery ? (
                  <IconButton
                    as="span"
                    icon="search"
                    iconSize={14}
                    title="Search layers"
                    textColor="var(--text-3)"
                    onClick={() => setLayerSearchOpen(true)}
                  />
                ) : undefined
              }
              search={
                <Search
                  value={layerQuery}
                  onChange={setLayerQuery}
                  placeholder="Search layers…"
                  w="fill"
                  autoFocus={layerSearchOpen && !layerQuery}
                  listItems={layerListItems}
                  onHighlightChange={setLayerHighlightId}
                />
              }
            />
          </Frame>
          {vm.doc ? (
            <CanvasLayersPanel
              doc={vm.doc}
              selectedIds={vm.selectedIds}
              onSelect={selectLayer}
              onToggleHidden={toggleLayerHidden}
              onToggleLocked={toggleLayerLocked}
              dirtyComponentIds={vm.dirtyComponentIds}
              onPush={(componentId) => vm.pushComponent(componentId)}
              fileStages={fileStages}
              onSetStatus={(path, stage) => setFileStatus(path, stage).catch(() => {})}
              onDeleteLayer={handleDeleteLayer}
              planNodeLinks={planNodeLinks}
              onShowInWorkspace={onOpenFile}
              onShowInPlanning={onShowInPlanning}
              query={layerQuery}
              highlightId={layerHighlightId}
            />
          ) : (
            <Frame grow />
          )}
        </Frame>

        {/* Board */}
        {vm.loading ? (
          <Frame grow align="center" justify="center">
            <span style={{ ...MONO, fontSize: 10, color: 'var(--text-3)' }}>Loading…</span>
          </Frame>
        ) : vm.doc ? (
          <CanvasBoard
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
            guides={vm.guides}
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
        ) : (
          <Frame grow flow="vertical" align="center" justify="center" gap={12}>
            <span style={{ ...MONO, fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
              {vm.docs.length > 0 ? 'NO BOARD OPEN' : 'NO BOARDS YET'}
            </span>
            <button
              type="button"
              onClick={() => vm.createBoard('Untitled')}
              style={{
                ...MONO,
                fontSize: 10,
                background: 'var(--bg-2)',
                border: '1px solid var(--border-1)',
                borderRadius: 'var(--radius-control)',
                color: 'var(--text-1)',
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              CREATE A BOARD
            </button>
          </Frame>
        )}

        {/* Inspector */}
        <Frame
          flow="vertical"
          style={{ width: INSPECTOR_W, minWidth: INSPECTOR_W, minHeight: 0 }}
          stroke={{ left: { color: 'border-1' } }}
        >
          <SidebarHeader framed label="PROPERTIES" />
          <CanvasInspector
            node={vm.singleSelected}
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
            onTextChange={(id, text) => vm.updateNodeFields(id, { text } as never)}
            onFontChange={vm.updateNodeFont}
            onComponentStyleChange={vm.updateVariantRootStyle}
            onVectorChange={(id, patch, gesture) => vm.updateNodeFields(id, patch as never, gesture)}
            editingVectorId={vm.editingVectorId}
            pointSelection={vm.pointSelection}
            onPointType={vm.setSelectedPointType}
            onPointRadius={vm.setSelectedPointRadius}
            onEditPoints={vm.enterVectorEdit}
            onDoneEditing={vm.exitVectorEdit}
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
            onWriteComponent={(componentId) => setPendingWrite({ componentId })}
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
            folderOptions={folderOptions}
            // Returned, not awaited: the panel shows a rejected move (a path
            // that escapes the component root, a failed write) inline under
            // the field rather than as a board-level error.
            onSetPath={async (componentId, nextPath) => {
              await vm.setComponentPath(componentId, nextPath)
              onWorkspaceChanged?.()
            }}
            onRemoveFromWorkspace={(componentId) => {
              vm.removeComponentFile(componentId)
                .then(() => onWorkspaceChanged?.())
                .catch((e: unknown) => {
                  vm.setError(e instanceof Error ? e.message : String(e))
                })
            }}
            onFlatten={vm.flattenComponentToFrame}
            canFlatten={vm.canFlattenSelectedComponent}
          />
        </Frame>

        {/* Docs — the old Research tab, kept as a pane rather than deleted. */}
        {showDocs && (
          <Frame
            flow="vertical"
            style={{ width: DOCS_W, minWidth: DOCS_W, minHeight: 0 }}
            stroke={{ left: { color: 'border-1' } }}
          >
            <ResearchView ref={docsBrowserRef} activeProject={activeProject} />
          </Frame>
        )}
      </Frame>

      {pendingWrite && pendingDraft && (
        <CreateComponentModal
          draft={pendingDraft}
          workspaceName={activeProject.name}
          onClose={() => setPendingWrite(null)}
          onApprove={async (input) => {
            await vm.approveComponent(pendingWrite.componentId, input)
            onWorkspaceChanged?.()
          }}
        />
      )}

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
