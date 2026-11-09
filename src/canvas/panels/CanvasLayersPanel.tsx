// The layers tree — a depth-indented view of doc.nodes, mirroring the board's
// own nesting. Built on the same ListRow + ContextMenu primitives as every
// other list in the app (the Workspace/Research file tree, Planning's node
// list) so hover/selection states, the hover-ellipsis menu, and status/delete
// behavior all read identically no matter which panel you're in.

import { memo, useCallback, useState } from 'react'
import { Frame } from '../../app/UIKit/Frame/Frame'
import { ListRow } from '../../app/UIKit/ListRow/ListRow'
import { Icon } from '../../app/UIKit/Icon/Icon'
import { IconButton } from '../../app/UIKit/IconButton/IconButton'
import { VisibilityToggle } from '../../app/UIKit/VisibilityToggle/VisibilityToggle'
import type { DefaultPlane } from '../../document/objects'
import { objectGroupsOf, planeGroupsOf, unusedSketchesOf, type ObjectGroup } from './planeGroups'
import type { IconName } from '../../app/UIKit/Icon/Icon'
import type { FeatureId, FeatureKind } from '../../document/objects'
import { ContextMenu, type ContextMenuItem } from '../../app/UIKit/ContextMenu/ContextMenu'
import { NODE_STAGES } from '../../planning/graph/stages'
import type { NodeStage, GraphMapId } from '../../planning/graph/types'
import type { PlanNodeLink } from '../../planning/usePlanNodeLinks'
import { childrenOf, isFrameNode, isInstanceNode, type CanvasDoc, type CanvasNode, type NodeId } from '../../document/types'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }

function GlyphToggle({
  on,
  onGlyph,
  offGlyph,
  title,
  onToggle,
}: {
  on: boolean
  onGlyph: string
  offGlyph: string
  title: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      style={{
        ...UI_FONT,
        fontSize: 10,
        lineHeight: 1,
        width: 16,
        height: 16,
        display: 'grid',
        placeItems: 'center',
        background: 'transparent',
        border: 'none',
        color: on ? 'var(--text-1)' : 'var(--text-3)',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {on ? onGlyph : offGlyph}
    </button>
  )
}

const KIND_LABEL: Record<CanvasNode['kind'], string> = {
  frame: '▢',
  text: 'T',
  instance: '◈',
  external: '⧉',
  vector: '✎',
}

/**
 * The layer's kind marker. Instances get the real component icon from the
 * shared library rather than a text glyph, so a component reads the same here
 * as it does on the board.
 */
function KindGlyph({ kind }: { kind: CanvasNode['kind'] }) {
  if (kind === 'instance') {
    return (
      <span style={{ display: 'inline-flex', width: 10, color: 'var(--text-2)' }}>
        <Icon name="component" size={10} />
      </span>
    )
  }
  if (kind === 'vector') {
    return (
      <span style={{ display: 'inline-flex', width: 10, color: 'var(--text-3)' }}>
        <Icon name="vector" size={10} />
      </span>
    )
  }
  return (
    <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', width: 10, display: 'inline-block' }}>
      {KIND_LABEL[kind]}
    </span>
  )
}

export interface CanvasLayersPanelProps {
  doc: CanvasDoc
  /** An environment's layers, grouped by plane with its parts after; false for a Sketch, which has no planes — its layer tree alone. */
  planes?: boolean
  selectedIds: Set<NodeId>
  onSelect: (id: NodeId, additive: boolean) => void
  onToggleHidden: (id: NodeId, hidden: boolean) => void
  /** Hides or shows several layers as one edit — a plane section's eye. */
  onSetHidden?: (ids: NodeId[], hidden: boolean) => void
  /** A new sketch on one of the default planes — a plane section's +. */
  onAddSketch?: (plane: DefaultPlane) => void
  /** Turns one of an object's features off or on (Onshape's suppress). */
  onSetFeatureHidden?: (featureId: FeatureId, hidden: boolean) => void
  /** Opens a sketch face on to draw on (double-clicking its row). */
  onOpenSketch?: (id: NodeId) => void
  onToggleLocked: (id: NodeId, locked: boolean) => void
  /** Components whose canvas state has changed since their file was last written — drives the dirty dot and "Push changes". */
  dirtyComponentIds: Set<string>
  onPush: (componentId: string) => void
  /** filePath → planning stage of the plan node a file backs (see useFileStages) — undefined/empty is fine, status just reads as unset. */
  fileStages: Map<string, NodeStage>
  onSetStatus: (path: string, stage: NodeStage | null) => void
  onDeleteLayer: (nodeId: NodeId) => void
  /** filePath → the plan node that backs it, for "Show in Planning". Absent entries just mean no such link exists — the menu item doesn't appear. */
  planNodeLinks: Map<string, PlanNodeLink>
  onShowInWorkspace?: (path: string) => void
  onShowInPlanning?: (mapId: GraphMapId, nodeId: string) => void
  /** A layer-name search (see layerMatches). Non-empty shows the matches as one flat list, like Planning's RESULTS. */
  query?: string
  /** The search's keyboard highlight — outlined the same way Planning outlines its highlighted row. */
  highlightId?: NodeId | null
  /** Sketch mode: the one sketch the list is narrowed to, so it can say so. */
  filteredTo?: string | null
  /** A Sketch document's name by id — what a placed sketch's row says it comes from. */
  sketchName?: (docId: string) => string | undefined
  /** What's broken, by layer or feature id, with why: a deleted sketch, a lost face, a link to nothing. */
  problems?: Map<string, string>
  /** Re-pick sketch / path for a broken feature. */
  onRepickFeature?: (featureId: FeatureId, input: 'sketch' | 'path', layerId: NodeId) => void
  onDeleteFeature?: (featureId: FeatureId) => void
  /** The feature whose settings the right panel shows — picked by clicking its row. */
  focusFeature?: FeatureId | null
  onFocusFeature?: (featureId: FeatureId | null) => void
  /** A feature dragged to another place in its part's list. */
  onMoveFeature?: (featureId: FeatureId, index: number) => void
  /** Delete a part from its row's menu (its sketches stay). */
  onDeletePart?: (objectId: string) => void
}

const DANGER = 'var(--danger)'

/** The mark on a broken row: a warning glyph, with why on hover. */
function BrokenMark({ why, label }: { why: string; label?: string }) {
  return (
    <span title={why} style={{ ...UI_FONT, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: DANGER, whiteSpace: 'nowrap', marginRight: 4 }}>
      <Icon name="alert-triangle" size={11} />
      {label}
    </span>
  )
}

/**
 * A section's heading — Parts, Sketches, Planes. Quieter than the rows under
 * it: it names the list, the rows are what's in it. A collapsible one carries
 * its chevron and its count when closed.
 */
function SectionHeading({ label, open, count, onToggle }: { label: string; open?: boolean; count?: number; onToggle?: () => void }) {
  return (
    <div
      data-canvas-section={label}
      role={onToggle ? 'button' : undefined}
      aria-expanded={onToggle ? open : undefined}
      onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '6px 6px 0 10px', ...UI_FONT, fontSize: 11, fontWeight: 400, color: 'var(--text-3)', cursor: onToggle ? 'pointer' : 'default', userSelect: 'none' }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        {label}
        {onToggle && !open && count !== undefined && ` (${count})`}
      </span>
      {onToggle && (
        <span style={{ display: 'grid', placeItems: 'center', width: 14, transform: open ? 'none' : 'rotate(-90deg)' }}>
          <Icon name="chevron-down" size={11} />
        </span>
      )}
    </div>
  )
}

/** A plane in the Planes section: its name, and on hover a + for a new sketch on it and the eye for everything standing there. */
function PlaneRow({
  label,
  nodes,
  onSetHidden,
  onAdd,
}: {
  label: string
  nodes: CanvasNode[]
  onSetHidden?: (ids: NodeId[], hidden: boolean) => void
  onAdd?: () => void
}) {
  const allHidden = nodes.length > 0 && nodes.every((n) => n.hidden)
  return (
    <ListRow
      selected={false}
      indent={8}
      iconStart={<Icon name="frame" size={12} />}
      trailing={(hovered) => (
        <Frame flow="horizontal" align="center" gap={2}>
          {!hovered && nodes.length > 0 && !allHidden && <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', marginRight: 4 }}>{nodes.length}</span>}
          {onAdd && hovered && <IconButton glyph="+" iconSize={13} size={20} textColor="var(--text-3)" title={`New sketch on the ${label} plane`} onClick={(e) => { e.stopPropagation(); onAdd() }} />}
          {onSetHidden && nodes.length > 0 && (hovered || allHidden) && (
            <VisibilityToggle visible={!allHidden} label={`everything on ${label}`} onToggle={(visible) => onSetHidden(nodes.map((n) => n.id), !visible)} />
          )}
        </Frame>
      )}
    >
      <span data-canvas-plane={label} style={{ color: allHidden ? 'var(--text-3)' : 'var(--text-2)' }}>{label}</span>
    </ListRow>
  )
}

/** Every layer whose name contains `query`, top-most first — the same order the tree reads in. */
export function layerMatches(doc: CanvasDoc, query: string): CanvasNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const out: CanvasNode[] = []
  const visit = (nodes: CanvasNode[]) => {
    for (const node of [...nodes].reverse()) {
      // A pattern's copies share their template's name — list the template once.
      if (node.repeatOf) continue
      if (node.name.toLowerCase().includes(needle)) out.push(node)
      visit(childrenOf(node))
    }
  }
  visit(doc.nodes)
  return out
}

type MenuState = { x: number; y: number; anchorEl: HTMLElement | null; node: CanvasNode }

// Memoized: while a node is dragged only it and its ancestors are new objects,
// so every other row skips rendering — on a big board that was hundreds of
// rows re-rendered per frame of every drag.
type LayerRowProps = {
  node: CanvasNode
  depth: number
  onOpenMenu: (e: React.MouseEvent, node: CanvasNode) => void
  /** A top-level row's double-click: open its sketch face on. */
  onOpen?: (id: NodeId) => void
} & Omit<
  CanvasLayersPanelProps,
  'doc' | 'onPush' | 'fileStages' | 'onSetStatus' | 'onDeleteLayer' | 'planNodeLinks' | 'onShowInWorkspace' | 'onShowInPlanning' | 'query' | 'highlightId' | 'onSetHidden' | 'onAddSketch' | 'onSetFeatureHidden' | 'onOpenSketch'
> & {
  /** A search result: no children, no nesting indent. */
  flat?: boolean
  highlighted?: boolean
}

/** A child's role in an along-path frame, for its layer tag — see document/pathFlow.ts and pathPattern.ts. */
function pathRoleOf(parent: CanvasNode, child: CanvasNode): 'path' | 'pattern' | undefined {
  if (!isFrameNode(parent) || !parent.style.alongPath) return undefined
  const guide = parent.children.find((c) => c.kind === 'vector')
  if (child === guide) return 'path'
  if (parent.style.alongPath.repeat !== undefined && !child.repeatOf && child === parent.children.find((c) => c !== guide && !c.repeatOf && !c.hidden)) return 'pattern'
  return undefined
}

const LayerRow = memo(function LayerRow({
  node,
  depth,
  selectedIds,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  dirtyComponentIds,
  onOpenMenu,
  onOpen,
  flat,
  highlighted,
  repeatCount,
  role,
  meta,
  linkedFrom,
  problem,
}: {
  node: CanvasNode
  depth: number
  /** Why this sketch is broken (its face is gone, its linked sketch deleted) — shown in place of where it stands. */
  problem?: string
  /** Grey trailing text while the row isn't hovered — where a sketch stands: "Top", "On a face". */
  meta?: string
  /** A placed sketch: the Sketch it comes from, shown with a link glyph. */
  linkedFrom?: string
  /** This layer's job in its along-path parent: the guide path, or the piece a pattern repeats. */
  role?: 'path' | 'pattern'
  /** A pattern template's run length (itself plus its copies) — its copies get no rows of their own. */
  repeatCount?: number
  onOpenMenu: (e: React.MouseEvent, node: CanvasNode) => void
  /** A top-level row's double-click: open its sketch face on. */
  onOpen?: (id: NodeId) => void
} & Omit<
  CanvasLayersPanelProps,
  'doc' | 'onPush' | 'fileStages' | 'onSetStatus' | 'onDeleteLayer' | 'planNodeLinks' | 'onShowInWorkspace' | 'onShowInPlanning' | 'query' | 'highlightId' | 'onSetHidden' | 'onAddSketch' | 'onSetFeatureHidden' | 'onOpenSketch'
> & {
  /** A search result: no children, no nesting indent. */
  flat?: boolean
  highlighted?: boolean
}) {
  const selected = selectedIds.has(node.id)
  const componentId = isInstanceNode(node) ? node.componentId : null
  const isDirty = !!componentId && dirtyComponentIds.has(componentId)
  return (
    <>
      <ListRow
        selected={selected}
        connected={highlighted && !selected}
        indent={8 + depth * 12}
        onClick={(e) => onSelect(node.id, e.shiftKey)}
        onDoubleClick={onOpen ? () => onOpen(node.id) : undefined}
        onContextMenu={(e) => onOpenMenu(e, node)}
        iconStart={<KindGlyph kind={node.kind} />}
        trailing={(hovered) => (
          <Frame flow="horizontal" align="center" gap={4}>
            {isDirty && !hovered && (
              <span
                title="Changes not yet pushed"
                style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent, #6fa8dc)', flexShrink: 0 }}
              />
            )}
            {!hovered && problem && <BrokenMark why={problem} label="Broken" />}
            {!hovered && !problem && !node.hidden && (meta || linkedFrom) && (
              <span
                title={linkedFrom ? `Placed from the sketch “${linkedFrom}”${meta ? `, on ${meta}` : ''}` : undefined}
                style={{ ...UI_FONT, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', marginRight: 4 }}
              >
                {linkedFrom && <Icon name="link" size={10} />}
                {linkedFrom ? `from ${linkedFrom}` : meta}
              </span>
            )}
            {/* A hidden layer keeps its struck eye showing, so it can be told at a glance and brought back. */}
            {!hovered && node.hidden && <VisibilityToggle visible={false} label={node.name} onToggle={() => onToggleHidden(node.id, false)} />}
            {hovered && (
              <>
                <VisibilityToggle visible={!node.hidden} label={node.name} onToggle={(visible) => onToggleHidden(node.id, !visible)} />
                <GlyphToggle
                  on={!!node.locked}
                  onGlyph="⊘"
                  offGlyph="○"
                  title={node.locked ? 'Unlock' : 'Lock'}
                  onToggle={() => onToggleLocked(node.id, !node.locked)}
                />
                <IconButton
                  onClick={(e) => { e.stopPropagation(); onOpenMenu(e, node) }}
                  title="More actions"
                  glyph="⋯"
                  iconSize={13}
                  textColor="var(--text-3)"
                />
              </>
            )}
          </Frame>
        )}
      >
        {/* A selected row takes ListRow's own text color — forcing text-1 here
            put white text on the white selected fill. */}
        <span style={{ color: selected ? 'inherit' : node.hidden ? 'var(--text-3)' : 'var(--text-1)' }}>{node.name}</span>
        {repeatCount !== undefined && repeatCount > 1 && (
          <span title="Repeated along the path — edit any piece to change every one" style={{ color: 'var(--text-3)', marginLeft: 6 }}>
            ×{repeatCount}
          </span>
        )}
        {role && (
          <span
            title={role === 'path' ? 'The path this frame lays its layers along' : 'Repeated along the path'}
            style={{ color: 'var(--accent, #6fa8dc)', marginLeft: 6, fontSize: 10, letterSpacing: '0.03em' }}
          >
            {role === 'path' ? 'Path' : 'Pattern'}
          </span>
        )}
        {node.repeatOf && (
          <span title="A piece of a pattern — its order and rotation are its own; everything else follows the original" style={{ color: 'var(--text-3)', marginLeft: 6 }}>
            ↻
          </span>
        )}
      </ListRow>
      {!flat &&
        isFrameNode(node) &&
        // Every piece of a pattern gets a row, in path order — the original
        // carries the run's length, each copy a ↻.
        childrenOf(node).map((child) => (
          <LayerRow
            key={child.id}
            node={child}
            repeatCount={child.repeatOf ? undefined : node.children.filter((c) => c.repeatOf === child.id).length + 1}
            role={pathRoleOf(node, child)}
            depth={depth + 1}
            selectedIds={selectedIds}
            onSelect={onSelect}
            onToggleHidden={onToggleHidden}
            onToggleLocked={onToggleLocked}
            dirtyComponentIds={dirtyComponentIds}
            onOpenMenu={onOpenMenu}
          />
        ))}
    </>
  )
}, layerRowPropsEqual)

/**
 * A row re-renders when its own props change, or when the selection changes
 * somewhere in ITS subtree — not on every selection change anywhere, which
 * re-rendered every row on the board at the start of each drag.
 */
function layerRowPropsEqual(prev: LayerRowProps, next: LayerRowProps): boolean {
  for (const key of Object.keys(next) as (keyof LayerRowProps)[]) {
    if (key === 'selectedIds') continue
    if (prev[key] !== next[key]) return false
  }
  if (prev.selectedIds === next.selectedIds) return true
  const changed = (node: CanvasNode): boolean =>
    prev.selectedIds.has(node.id) !== next.selectedIds.has(node.id) || childrenOf(node).some(changed)
  return !changed(next.node)
}

export function CanvasLayersPanel({
  doc,
  planes = true,
  selectedIds,
  onSelect,
  onToggleHidden,
  onSetHidden,
  onAddSketch,
  onSetFeatureHidden,
  onOpenSketch,
  onToggleLocked,
  dirtyComponentIds,
  onPush,
  fileStages,
  onSetStatus,
  onDeleteLayer,
  planNodeLinks,
  onShowInWorkspace,
  onShowInPlanning,
  query,
  highlightId,
  filteredTo,
  sketchName,
  problems,
  onRepickFeature,
  onDeleteFeature,
  focusFeature,
  onFocusFeature,
  onMoveFeature,
  onDeletePart,
}: CanvasLayersPanelProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  // Planes are reference, not content: closed until asked for.
  const [planesOpen, setPlanesOpen] = useState(false)

  const openMenu = useCallback((e: React.MouseEvent, node: CanvasNode) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, anchorEl: e.currentTarget as HTMLElement, node })
  }, [])

  const menuItems = ((): ContextMenuItem[] => {
    if (!menu) return []
    const node = menu.node
    const component = isInstanceNode(node) ? doc.components.find((c) => c.id === node.componentId) : undefined
    const filePath = component?.filePath
    const items: ContextMenuItem[] = []

    if (filePath) {
      const currentStage = fileStages.get(filePath)
      items.push({
        label: 'Set status',
        children: [
          ...NODE_STAGES.map((s): ContextMenuItem => ({
            label: s.label,
            onSelect: () => onSetStatus(filePath, s.id),
          })),
          { label: 'Clear status', separator: true, disabled: !currentStage, onSelect: () => onSetStatus(filePath, null) },
        ],
      })
      if (component && dirtyComponentIds.has(component.id)) {
        items.push({ label: 'Push changes', separator: true, onSelect: () => onPush(component.id) })
      }
      if (onShowInWorkspace) {
        items.push({ label: 'Show in Workspace', separator: true, onSelect: () => onShowInWorkspace(filePath) })
      }
      const planLink = planNodeLinks.get(filePath)
      if (planLink && onShowInPlanning) {
        items.push({ label: 'Show in Planning', onSelect: () => onShowInPlanning(planLink.mapId, planLink.nodeId) })
      }
    }

    items.push({ label: 'Delete', separator: true, destructive: true, onSelect: () => onDeleteLayer(node.id) })
    return items
  })()

  // An empty board still shows its planes, each ready for a first sketch.
  if (doc.nodes.length === 0 && !onAddSketch) {
    return (
      <Frame flow="vertical" align="center" justify="center" padding={16} grow>
        <span style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-3)' }}>No layers</span>
      </Frame>
    )
  }
  if (query?.trim()) {
    const matches = layerMatches(doc, query)
    return (
      <Frame flow="vertical" w="fill" style={{ overflowY: 'auto' }} grow>
        {matches.length === 0 ? (
          <span style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-3)', padding: '10px 12px' }}>No layers match “{query.trim()}”.</span>
        ) : (
          matches.map((node) => (
            <LayerRow
              key={node.id}
              node={node}
              depth={0}
              flat
              highlighted={node.id === highlightId}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onToggleHidden={onToggleHidden}
              onToggleLocked={onToggleLocked}
              dirtyComponentIds={dirtyComponentIds}
              onOpenMenu={openMenu}
            />
          ))
        )}
        {menu && (
          <ContextMenu x={menu.x} y={menu.y} anchorEl={menu.anchorEl} items={menuItems} onClose={() => setMenu(null)} />
        )}
      </Frame>
    )
  }
  const menuEl = menu && <ContextMenu x={menu.x} y={menu.y} anchorEl={menu.anchorEl} items={menuItems} onClose={() => setMenu(null)} />
  const parts = planes ? objectGroupsOf(doc) : []
  const sketches = planes ? unusedSketchesOf(doc) : []
  const planeRows = planes ? planeGroupsOf(doc) : []

  return (
    <Frame flow="vertical" w="fill" style={{ overflowY: 'auto' }} grow>
      {/* A Sketch: Figma's layer tree, top-most first (the last node paints on top). */}
      {!planes &&
        [...doc.nodes].reverse().map((node) => (
          <LayerRow
            key={node.id}
            node={node}
            depth={0}
            selectedIds={selectedIds}
            onSelect={onSelect}
            onToggleHidden={onToggleHidden}
            onToggleLocked={onToggleLocked}
            dirtyComponentIds={dirtyComponentIds}
            onOpenMenu={openMenu}
          />
        ))}
      {/* An environment: what was built, then what's waiting to be used, then the planes. */}
      {planes && filteredTo && (
        <div style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-3)', padding: '8px 12px 2px', lineHeight: 1.5 }}>
          Showing {filteredTo} only, while you edit it — Finish sketch for everything.
        </div>
      )}
      {planes && !filteredTo && parts.length === 0 && sketches.length === 0 && (
        <div style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-3)', padding: '10px 12px', lineHeight: 1.5 }}>
          Nothing built yet. Add a sketch with + Sketch, or a starter shape from the toolbox.
        </div>
      )}
      {/* Parts: each part's features in order, each with the sketch it uses — Onshape's feature list. */}
      {!filteredTo && parts.length > 0 && (
        <div>
          <SectionHeading label="Parts" />
          {parts.map((group) => (
            <ObjectRows
              key={group.object.id}
              group={group}
              selectedIds={selectedIds}
              row={(node) => (
                <LayerRow
                  key={node.id}
                  node={node}
                  depth={3}
                  selectedIds={selectedIds}
                  onSelect={onSelect}
                  onToggleHidden={onToggleHidden}
                  onToggleLocked={onToggleLocked}
                  dirtyComponentIds={dirtyComponentIds}
                  onOpenMenu={openMenu}
                  onOpen={onOpenSketch}
                  linkedFrom={node.sketch?.link ? (sketchName?.(node.sketch.link.doc) ?? 'a sketch') : undefined}
                  problem={problems?.get(node.id)}
                />
              )}
              onSelect={onSelect}
              onSetHidden={onSetHidden}
              onSetFeatureHidden={onSetFeatureHidden}
              onOpenSketch={onOpenSketch}
              problems={problems}
              candidates={sketches.map((s) => s.node)}
              onRepickFeature={onRepickFeature}
              onDeleteFeature={onDeleteFeature}
              focusFeature={focusFeature}
              onFocusFeature={onFocusFeature}
              onMoveFeature={onMoveFeature}
              onDeletePart={onDeletePart}
            />
          ))}
        </div>
      )}
      {/* Sketches no part uses yet, flat, each saying where it stands — or what it's placed from. */}
      {sketches.length > 0 && (
        <div>
          <SectionHeading label="Sketches" />
          {sketches.map(({ node, where, link }) => (
            <LayerRow
              key={node.id}
              node={node}
              depth={0}
              meta={where}
              linkedFrom={link ? (sketchName?.(link.doc) ?? 'a sketch') : undefined}
              problem={problems?.get(node.id)}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onToggleHidden={onToggleHidden}
              onToggleLocked={onToggleLocked}
              dirtyComponentIds={dirtyComponentIds}
              onOpenMenu={openMenu}
              onOpen={onOpenSketch}
            />
          ))}
        </div>
      )}
      {/* The planes sketches stand on: reference, so closed until opened. */}
      {planes && !filteredTo && (
        <div>
          <SectionHeading label="Planes" open={planesOpen} count={planeRows.length} onToggle={() => setPlanesOpen((o) => !o)} />
          {planesOpen &&
            planeRows.map((group) => (
              <PlaneRow
                key={group.id}
                label={group.label}
                nodes={group.nodes}
                onSetHidden={onSetHidden}
                onAdd={group.plane && onAddSketch ? () => onAddSketch(group.plane!) : undefined}
              />
            ))}
        </div>
      )}
      {menuEl}
    </Frame>
  )
}

const FEATURE_ICONS: Record<FeatureKind, IconName> = { extrude: 'extrude', revolve: 'revolve', sweep: 'sweep', loft: 'loft' }

/**
 * One object in the Objects section: its row (the eye hides the whole part),
 * and, open, each feature (its eye turns just that step off, leaving its
 * sketch flat) with the sketch it uses beneath it.
 */
function ObjectRows({
  group,
  selectedIds,
  row,
  onSelect,
  onSetHidden,
  onSetFeatureHidden,
  onOpenSketch,
  problems,
  candidates = [],
  onRepickFeature,
  onDeleteFeature,
  focusFeature,
  onFocusFeature,
  onMoveFeature,
  onDeletePart,
}: {
  group: ObjectGroup
  selectedIds: Set<NodeId>
  row: (node: CanvasNode) => React.ReactNode
  onSelect: (id: NodeId, additive: boolean) => void
  onSetHidden?: (ids: NodeId[], hidden: boolean) => void
  onSetFeatureHidden?: (featureId: FeatureId, hidden: boolean) => void
  onOpenSketch?: (id: NodeId) => void
  problems?: Map<string, string>
  /** Sketches a broken feature can re-pick: the ones no part uses yet. */
  candidates?: CanvasNode[]
  onRepickFeature?: (featureId: FeatureId, input: 'sketch' | 'path', layerId: NodeId) => void
  onDeleteFeature?: (featureId: FeatureId) => void
  /** The feature whose settings the right panel shows — picked by clicking its row. */
  focusFeature?: FeatureId | null
  onFocusFeature?: (featureId: FeatureId | null) => void
  /** A feature dragged to another place in its part's list. */
  onMoveFeature?: (featureId: FeatureId, index: number) => void
  /** Delete a part from its row's menu (its sketches stay). */
  onDeletePart?: (objectId: string) => void
}) {
  const [partMenu, setPartMenu] = useState<{ x: number; y: number; anchorEl: HTMLElement } | null>(null)
  // A feature being dragged to a new place in the list, and the row it would land before.
  const [dragging, setDragging] = useState<FeatureId | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [featureMenu, setFeatureMenu] = useState<{ x: number; y: number; anchorEl: HTMLElement; feature: ObjectGroup['features'][number]['feature']; why?: string } | null>(null)
  const brokenCount = group.features.filter(({ feature }) => problems?.has(feature.id)).length
  // Closed to one row each, so a board of parts reads as a list; the one holding the selection opens itself.
  const [toggled, setOpen] = useState<boolean | null>(null)
  const { object, features, layers } = group
  const hidden = layers.length > 0 && layers.every((n) => n.hidden)
  const selected = layers.some((n) => selectedIds.has(n.id))
  const open = toggled ?? selected
  const chevron = (
    <span
      role="button"
      aria-label={open ? 'Collapse' : 'Expand'}
      onClick={(e) => {
        e.stopPropagation()
        setOpen(!open)
      }}
      style={{ display: 'grid', placeItems: 'center', width: 14, transform: open ? 'none' : 'rotate(-90deg)', color: 'var(--text-3)' }}
    >
      <Icon name="chevron-down" size={11} />
    </span>
  )
  return (
    <>
      <ListRow
        selected={false}
        connected={selected}
        indent={8}
        leading={chevron}
        iconStart={<Icon name="box" size={13} />}
        onClick={(e) => {
          onFocusFeature?.(null)
          if (layers[0]) onSelect(layers[0].id, e.shiftKey)
        }}
        onContextMenu={(e) => {
          if (!onDeletePart) return
          e.preventDefault()
          setPartMenu({ x: e.clientX, y: e.clientY, anchorEl: e.currentTarget as HTMLElement })
        }}
        trailing={(hovered) => (
          <Frame flow="horizontal" align="center" gap={2}>
            {onSetHidden && layers.length > 0 && (hovered || hidden) && (
              <VisibilityToggle visible={!hidden} label={object.name} onToggle={(visible) => onSetHidden(layers.map((n) => n.id), !visible)} />
            )}
            {hovered && onDeletePart && (
              <IconButton
                glyph="⋯"
                iconSize={13}
                textColor="var(--text-3)"
                title="More actions"
                onClick={(e) => {
                  e.stopPropagation()
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setPartMenu({ x: r.left, y: r.bottom + 4, anchorEl: e.currentTarget as HTMLElement })
                }}
              />
            )}
          </Frame>
        )}
      >
        <span data-canvas-object={object.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: hidden ? 'var(--text-3)' : 'var(--text-1)' }}>
          {object.name}
          {brokenCount > 0 && <BrokenMark why={`${brokenCount === 1 ? 'A feature' : `${brokenCount} features`} can't be built — open the part to fix`} />}
        </span>
      </ListRow>
      {open &&
        features.map(({ feature, sketches }, index) => {
          const why = problems?.get(feature.id)
          const reading = sketches.some((n) => selectedIds.has(n.id))
          return (
            <div
              key={feature.id}
              data-feature-row={feature.id}
              draggable={!!onMoveFeature && features.length > 1}
              onDragStart={(e) => {
                setDragging(feature.id)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', feature.id)
              }}
              onDragOver={(e) => {
                if (!dragging) return
                e.preventDefault()
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setDropAt(e.clientY < r.top + r.height / 2 ? index : index + 1)
              }}
              onDrop={(e) => {
                e.preventDefault()
                const from = features.findIndex((f) => f.feature.id === dragging)
                if (dragging && dropAt !== null && from >= 0) onMoveFeature?.(dragging, dropAt > from ? dropAt - 1 : dropAt)
                setDragging(null)
                setDropAt(null)
              }}
              onDragEnd={() => {
                setDragging(null)
                setDropAt(null)
              }}
              // Where it would land: a line above the row it'd go before (or below the last).
              style={{
                boxShadow: dragging && dropAt === index ? 'inset 0 2px 0 var(--text-2)' : dragging && dropAt === index + 1 && index === features.length - 1 ? 'inset 0 -2px 0 var(--text-2)' : undefined,
                opacity: dragging === feature.id ? 0.5 : 1,
              }}
            >
              <ListRow
                selected={reading && focusFeature === feature.id}
                connected={reading}
                indent={22}
                iconStart={<Icon name={FEATURE_ICONS[feature.kind]} size={13} />}
                onClick={(e) => {
                  onFocusFeature?.(feature.id)
                  if (sketches[0]) onSelect(sketches[0].id, e.shiftKey)
                }}
                onDoubleClick={() => sketches[0] && onOpenSketch?.(sketches[0].id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setFeatureMenu({ x: e.clientX, y: e.clientY, anchorEl: e.currentTarget as HTMLElement, feature, why })
                }}
                trailing={(hovered) => (
                  <Frame flow="horizontal" align="center" gap={2}>
                    {why && !hovered && <BrokenMark why={why} />}
                    {onSetFeatureHidden && (hovered || feature.hidden) && (
                      <VisibilityToggle visible={!feature.hidden} label={feature.name} onToggle={(visible) => onSetFeatureHidden(feature.id, !visible)} />
                    )}
                    {hovered && (
                      <IconButton
                        glyph="⋯"
                        iconSize={13}
                        textColor="var(--text-3)"
                        title="More actions"
                        onClick={(e) => {
                          e.stopPropagation()
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setFeatureMenu({ x: r.left, y: r.bottom + 4, anchorEl: e.currentTarget as HTMLElement, feature, why })
                        }}
                      />
                    )}
                  </Frame>
                )}
              >
                <span data-canvas-feature={feature.id} title={why} style={{ color: why ? DANGER : feature.hidden ? 'var(--text-3)' : 'var(--text-2)' }}>
                  {feature.name}
                </span>
              </ListRow>
              {why && (
                <div style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', padding: '0 12px 4px 44px', lineHeight: 1.5 }}>
                  {why}. Right-click to re-pick, or delete it.
                </div>
              )}
              {sketches.map(row)}
            </div>
          )
        })}
      {featureMenu && (
        <ContextMenu
          x={featureMenu.x}
          y={featureMenu.y}
          anchorEl={featureMenu.anchorEl}
          onClose={() => setFeatureMenu(null)}
          items={featureMenuItems(featureMenu.feature, featureMenu.why, candidates, onRepickFeature, onDeleteFeature)}
        />
      )}
      {partMenu && onDeletePart && (
        <ContextMenu
          x={partMenu.x}
          y={partMenu.y}
          anchorEl={partMenu.anchorEl}
          onClose={() => setPartMenu(null)}
          items={[{ label: `Delete ${object.name}`, destructive: true, onSelect: () => onDeletePart(object.id) }]}
        />
      )}
    </>
  )
}

/** A feature's menu: on a broken one, Re-pick sketch (or path) from the sketches no part uses yet; on any, Delete. */
function featureMenuItems(
  feature: ObjectGroup['features'][number]['feature'],
  why: string | undefined,
  candidates: CanvasNode[],
  onRepick?: (featureId: FeatureId, input: 'sketch' | 'path', layerId: NodeId) => void,
  onDelete?: (featureId: FeatureId) => void,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = []
  if (why && onRepick) {
    const input = why.startsWith('The path') ? 'path' : 'sketch'
    items.push(
      candidates.length
        ? { label: input === 'path' ? 'Re-pick path' : 'Re-pick sketch', children: candidates.map((n) => ({ label: n.name, onSelect: () => onRepick(feature.id, input, n.id) })) }
        : { label: input === 'path' ? 'Re-pick path (no free sketch)' : 'Re-pick sketch (no free sketch)', disabled: true },
    )
  }
  if (onDelete) items.push({ label: `Delete ${feature.name}`, separator: items.length > 0, destructive: true, onSelect: () => onDelete(feature.id) })
  return items
}
