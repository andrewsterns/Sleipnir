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
import { ContextMenu, type ContextMenuItem } from '../../app/UIKit/ContextMenu/ContextMenu'
import { NODE_STAGES } from '../../00_planning/graph/stages'
import type { NodeStage, GraphMapId } from '../../00_planning/graph/types'
import type { PlanNodeLink } from '../../00_planning/usePlanNodeLinks'
import { childrenOf, isFrameNode, isInstanceNode, type CanvasDoc, type CanvasNode, type NodeId } from '../model/types'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

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
        ...MONO,
        fontSize: 9,
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
    <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', width: 10, display: 'inline-block' }}>
      {KIND_LABEL[kind]}
    </span>
  )
}

export interface CanvasLayersPanelProps {
  doc: CanvasDoc
  selectedIds: Set<NodeId>
  onSelect: (id: NodeId, additive: boolean) => void
  onToggleHidden: (id: NodeId, hidden: boolean) => void
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
} & Omit<
  CanvasLayersPanelProps,
  'doc' | 'onPush' | 'fileStages' | 'onSetStatus' | 'onDeleteLayer' | 'planNodeLinks' | 'onShowInWorkspace' | 'onShowInPlanning' | 'query' | 'highlightId'
> & {
  /** A search result: no children, no nesting indent. */
  flat?: boolean
  highlighted?: boolean
}

/** A child's role in an along-path frame, for its layer tag — see model/pathFlow.ts and pathPattern.ts. */
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
  flat,
  highlighted,
  repeatCount,
  role,
}: {
  node: CanvasNode
  depth: number
  /** This layer's job in its along-path parent: the guide path, or the piece a pattern repeats. */
  role?: 'path' | 'pattern'
  /** A pattern template's run length (itself plus its copies) — its copies get no rows of their own. */
  repeatCount?: number
  onOpenMenu: (e: React.MouseEvent, node: CanvasNode) => void
} & Omit<
  CanvasLayersPanelProps,
  'doc' | 'onPush' | 'fileStages' | 'onSetStatus' | 'onDeleteLayer' | 'planNodeLinks' | 'onShowInWorkspace' | 'onShowInPlanning' | 'query' | 'highlightId'
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
            {hovered && (
              <>
                <GlyphToggle
                  on={!!node.hidden}
                  onGlyph="◌"
                  offGlyph="◉"
                  title={node.hidden ? 'Show' : 'Hide'}
                  onToggle={() => onToggleHidden(node.id, !node.hidden)}
                />
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
            style={{ color: 'var(--accent, #6fa8dc)', marginLeft: 6, fontSize: 9, letterSpacing: '0.06em' }}
          >
            {role === 'path' ? 'PATH' : 'PATTERN'}
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
  selectedIds,
  onSelect,
  onToggleHidden,
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
}: CanvasLayersPanelProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)

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

  if (doc.nodes.length === 0) {
    return (
      <Frame flow="vertical" align="center" justify="center" padding={16} grow>
        <span style={{ ...MONO, fontSize: 10, color: 'var(--text-3)' }}>No layers</span>
      </Frame>
    )
  }
  if (query?.trim()) {
    const matches = layerMatches(doc, query)
    return (
      <Frame flow="vertical" w="fill" style={{ overflowY: 'auto' }} grow>
        {matches.length === 0 ? (
          <span style={{ ...MONO, fontSize: 10, color: 'var(--text-3)', padding: '10px 12px' }}>No layers match “{query.trim()}”.</span>
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
  return (
    <Frame flow="vertical" w="fill" style={{ overflowY: 'auto' }} grow>
      {/* Last node paints on top on the board, so the list reads top-most first. */}
      {[...doc.nodes].reverse().map((node) => (
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
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} anchorEl={menu.anchorEl} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </Frame>
  )
}
