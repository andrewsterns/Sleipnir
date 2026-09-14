// The layers tree — a depth-indented view of doc.nodes, mirroring the board's
// own nesting. Built on the same ListRow + ContextMenu primitives as every
// other list in the app (the Workspace/Research file tree, Planning's node
// list) so hover/selection states, the hover-ellipsis menu, and status/delete
// behavior all read identically no matter which panel you're in.

import { useState } from 'react'
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
}

type MenuState = { x: number; y: number; anchorEl: HTMLElement | null; node: CanvasNode }

function LayerRow({
  node,
  depth,
  selectedIds,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  dirtyComponentIds,
  onOpenMenu,
}: {
  node: CanvasNode
  depth: number
  onOpenMenu: (e: React.MouseEvent, node: CanvasNode) => void
} & Omit<
  CanvasLayersPanelProps,
  'doc' | 'onPush' | 'fileStages' | 'onSetStatus' | 'onDeleteLayer' | 'planNodeLinks' | 'onShowInWorkspace' | 'onShowInPlanning'
>) {
  const selected = selectedIds.has(node.id)
  const componentId = isInstanceNode(node) ? node.componentId : null
  const isDirty = !!componentId && dirtyComponentIds.has(componentId)
  return (
    <>
      <ListRow
        selected={selected}
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
        <span style={{ color: node.hidden ? 'var(--text-3)' : 'var(--text-1)' }}>{node.name}</span>
      </ListRow>
      {isFrameNode(node) &&
        childrenOf(node).map((child) => (
          <LayerRow
            key={child.id}
            node={child}
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
}: CanvasLayersPanelProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)

  const openMenu = (e: React.MouseEvent, node: CanvasNode) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, anchorEl: e.currentTarget as HTMLElement, node })
  }

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
