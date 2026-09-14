// The components directory — an isolated mirror of the component root showing
// only canvas components, sitting below the layers panel.
//
// It is derived from each component's own filePath (see model/componentTree),
// so it can never drift from what is actually on disk. Folders you create
// before putting anything in them are the one stored part; everything else
// falls out of the components themselves.
//
// Built on the same ListRow + ContextMenu primitives as the layers panel and
// the Workspace file tree, so selection, hover and the ellipsis menu read
// identically wherever you are.

import { useState } from 'react'
import { Frame } from '../../app/UIKit/Frame/Frame'
import { Icon } from '../../app/UIKit/Icon/Icon'
import { IconButton } from '../../app/UIKit/IconButton/IconButton'
import { ListRow } from '../../app/UIKit/ListRow/ListRow'
import { ContextMenu, type ContextMenuItem } from '../../app/UIKit/ContextMenu/ContextMenu'
import type { ComponentTree, ComponentTreeNode } from '../model/componentTree'
import type { CanvasComponent } from '../model/types'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface CanvasComponentsPanelProps {
  tree: ComponentTree
  /** Root the tree mirrors, shown as the header label. */
  componentRoot: string
  selectedComponentId: string | null
  dirtyComponentIds: Set<string>
  onSelectComponent: (componentId: string) => void
  onAddFolder: (path: string) => void
  onRemoveFolder: (path: string) => void
  onPush: (componentId: string) => void
  onOpenFile?: (path: string) => void
  onRemoveFromWorkspace: (componentId: string) => void
}

type MenuState =
  | { kind: 'folder'; x: number; y: number; anchorEl: HTMLElement | null; path: string }
  | { kind: 'component'; x: number; y: number; anchorEl: HTMLElement | null; component: CanvasComponent }

function TreeRows({
  nodes,
  depth,
  collapsed,
  onToggleFolder,
  selectedComponentId,
  dirtyComponentIds,
  onSelectComponent,
  onOpenMenu,
}: {
  nodes: ComponentTreeNode[]
  depth: number
  collapsed: Set<string>
  onToggleFolder: (path: string) => void
  selectedComponentId: string | null
  dirtyComponentIds: Set<string>
  onSelectComponent: (componentId: string) => void
  onOpenMenu: (e: React.MouseEvent, target: MenuState) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === 'folder') {
          const isCollapsed = collapsed.has(node.path)
          return (
            <div key={`f-${node.path}`}>
              <ListRow
                indent={8 + depth * 12}
                onClick={() => onToggleFolder(node.path)}
                onContextMenu={(e) =>
                  onOpenMenu(e, { kind: 'folder', x: e.clientX, y: e.clientY, anchorEl: null, path: node.path })
                }
                iconStart={
                  <span
                    style={{
                      ...MONO,
                      fontSize: 9,
                      color: 'var(--text-3)',
                      width: 10,
                      display: 'inline-block',
                      transform: isCollapsed ? 'none' : 'rotate(90deg)',
                    }}
                  >
                    ▸
                  </span>
                }
                trailing={(hovered) =>
                  hovered ? (
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenMenu(e, {
                          kind: 'folder',
                          x: e.clientX,
                          y: e.clientY,
                          anchorEl: e.currentTarget as HTMLElement,
                          path: node.path,
                        })
                      }}
                      title="More actions"
                      glyph="⋯"
                      iconSize={13}
                      textColor="var(--text-3)"
                    />
                  ) : null
                }
              >
                <span style={{ color: 'var(--text-2)' }}>{node.name}</span>
              </ListRow>
              {!isCollapsed && (
                <TreeRows
                  nodes={node.children}
                  depth={depth + 1}
                  collapsed={collapsed}
                  onToggleFolder={onToggleFolder}
                  selectedComponentId={selectedComponentId}
                  dirtyComponentIds={dirtyComponentIds}
                  onSelectComponent={onSelectComponent}
                  onOpenMenu={onOpenMenu}
                />
              )}
            </div>
          )
        }

        const isDirty = dirtyComponentIds.has(node.component.id)
        return (
          <ListRow
            key={`c-${node.component.id}`}
            selected={node.component.id === selectedComponentId}
            indent={8 + depth * 12}
            onClick={() => onSelectComponent(node.component.id)}
            onContextMenu={(e) =>
              onOpenMenu(e, {
                kind: 'component',
                x: e.clientX,
                y: e.clientY,
                anchorEl: null,
                component: node.component,
              })
            }
            iconStart={
              <span style={{ display: 'inline-flex', width: 10, color: 'var(--text-2)' }}>
                <Icon name="component" size={10} />
              </span>
            }
            trailing={(hovered) => (
              <Frame flow="horizontal" align="center" gap={4}>
                {isDirty && !hovered && (
                  <span
                    title="Changes not yet pushed"
                    style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent, #6fa8dc)' }}
                  />
                )}
                {hovered && (
                  <IconButton
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenMenu(e, {
                        kind: 'component',
                        x: e.clientX,
                        y: e.clientY,
                        anchorEl: e.currentTarget as HTMLElement,
                        component: node.component,
                      })
                    }}
                    title="More actions"
                    glyph="⋯"
                    iconSize={13}
                    textColor="var(--text-3)"
                  />
                )}
              </Frame>
            )}
          >
            <span style={{ color: 'var(--text-1)' }}>{node.name}</span>
          </ListRow>
        )
      })}
    </>
  )
}

export function CanvasComponentsPanel({
  tree,
  componentRoot,
  selectedComponentId,
  dirtyComponentIds,
  onSelectComponent,
  onAddFolder,
  onRemoveFolder,
  onPush,
  onOpenFile,
  onRemoveFromWorkspace,
}: CanvasComponentsPanelProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [addingIn, setAddingIn] = useState<string | null>(null)
  const [newFolder, setNewFolder] = useState('')

  const toggleFolder = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const submitFolder = () => {
    const name = newFolder.trim()
    if (name) onAddFolder(addingIn ? `${addingIn}/${name}` : name)
    setAddingIn(null)
    setNewFolder('')
  }

  const menuItems = ((): ContextMenuItem[] => {
    if (!menu) return []
    if (menu.kind === 'folder') {
      return [
        { label: 'New folder here', onSelect: () => setAddingIn(menu.path) },
        {
          label: 'Remove folder',
          separator: true,
          destructive: true,
          // Only forgets the folder record; a folder still holding components
          // is derived from their paths and keeps showing.
          onSelect: () => onRemoveFolder(menu.path),
        },
      ]
    }
    const component = menu.component
    const items: ContextMenuItem[] = [{ label: 'Select on canvas', onSelect: () => onSelectComponent(component.id) }]
    if (component.filePath) {
      if (onOpenFile) items.push({ label: 'Open in Workspace', onSelect: () => onOpenFile(component.filePath!) })
      if (dirtyComponentIds.has(component.id)) {
        items.push({ label: 'Push changes', separator: true, onSelect: () => onPush(component.id) })
      }
      items.push({
        label: 'Remove from workspace',
        separator: true,
        destructive: true,
        onSelect: () => onRemoveFromWorkspace(component.id),
      })
    }
    return items
  })()

  const isEmpty = tree.root.children.length === 0 && tree.unplaced.length === 0

  return (
    <Frame flow="vertical" w="fill" style={{ minHeight: 0 }}>
      <Frame
        flow="horizontal"
        align="center"
        w="fill"
        padding={{ top: 8, bottom: 8, left: 10, right: 6 }}
        stroke={{ bottom: { color: 'border-1' } }}
      >
        <span
          title={componentRoot}
          style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.08em', flex: 1 }}
        >
          COMPONENTS
        </span>
        <IconButton
          icon="folder-add"
          title="New folder"
          onClick={() => {
            setAddingIn('')
            setNewFolder('')
          }}
        />
      </Frame>

      <Frame flow="vertical" w="fill" style={{ overflowY: 'auto' }} grow>
        {addingIn !== null && (
          <Frame padding={{ top: 4, bottom: 4, left: 10, right: 10 }} w="fill">
            <input
              autoFocus
              value={newFolder}
              placeholder={addingIn ? `${addingIn}/new folder` : 'folder name'}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitFolder()
                if (e.key === 'Escape') {
                  setAddingIn(null)
                  setNewFolder('')
                }
              }}
              onBlur={() => {
                if (!newFolder) setAddingIn(null)
              }}
              style={{
                ...MONO,
                background: 'var(--bg-2)',
                border: '1px solid var(--border-1)',
                borderRadius: 'var(--radius-control)',
                color: 'var(--text-1)',
                fontSize: 10,
                padding: '4px 6px',
                outline: 'none',
                width: '100%',
              }}
            />
          </Frame>
        )}

        {isEmpty && addingIn === null ? (
          <Frame flow="vertical" align="center" justify="center" padding={16} gap={4}>
            <span style={{ ...MONO, fontSize: 10, color: 'var(--text-3)' }}>No components yet</span>
            <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', textAlign: 'center' }}>
              Select a frame and choose Create component.
            </span>
          </Frame>
        ) : (
          <>
            <TreeRows
              nodes={tree.root.children}
              depth={0}
              collapsed={collapsed}
              onToggleFolder={toggleFolder}
              selectedComponentId={selectedComponentId}
              dirtyComponentIds={dirtyComponentIds}
              onSelectComponent={onSelectComponent}
              onOpenMenu={(_e, target) => setMenu(target)}
            />

            {/* Components that exist on the board but have no file yet — shown
                apart rather than given a folder they don't actually live in. */}
            {tree.unplaced.length > 0 && (
              <>
                <Frame padding={{ top: 8, bottom: 4, left: 10, right: 10 }}>
                  <span style={{ ...MONO, fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.08em' }}>
                    NOT IN WORKSPACE
                  </span>
                </Frame>
                <TreeRows
                  nodes={tree.unplaced}
                  depth={0}
                  collapsed={collapsed}
                  onToggleFolder={toggleFolder}
                  selectedComponentId={selectedComponentId}
                  dirtyComponentIds={dirtyComponentIds}
                  onSelectComponent={onSelectComponent}
                  onOpenMenu={(_e, target) => setMenu(target)}
                />
              </>
            )}
          </>
        )}
      </Frame>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          anchorEl={menu.anchorEl}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </Frame>
  )
}
