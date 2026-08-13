import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon, type IconName } from '../UIKit/Icon/Icon'
import { IconButton } from '../UIKit/IconButton/IconButton'
import { ListRow } from '../UIKit/ListRow/ListRow'
import { Dropdown } from '../UIKit/Dropdown/Dropdown'
import { Chip } from '../UIKit/Chip/Chip'
import { Search } from '../UIKit/Search/Search'
import { ScrollWindow } from '../UIKit/ScrollWindow/ScrollWindow'
import { SidebarHeader } from '../UIKit/SidebarHeader/SidebarHeader'
import { ContextMenu, type ContextMenuItem } from '../UIKit/ContextMenu/ContextMenu'
import { DeletePathModal } from './DeletePathModal'
import { RenamePathModal } from './RenamePathModal'
import { useFileClipboard, setFileClipboard, getFileClipboard } from '../UIKit/fileClipboard'
import {
  createFile as createSrcFile,
  createDir as createSrcDir,
  setArchived,
  regenerateGraph,
  renameWorkspacePath,
  copyWorkspacePath,
  getWorkspaceInfo,
  type FileTreeNode,
  type ArchiveEntry,
} from '../../00_planning/api/sleipnirApi'
import type { GraphNode, NodeStage } from '../../00_planning/graph/types'
import { useFileStages } from '../../00_planning/useFileStages'
import { StatusGlyph } from '../../00_planning/graph/StatusGlyph'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Name-entry field styled to match the Search box (variant="surface") — bg-2
// surface, border-1 hairline, shared control radius, 10px mono. Theme-aware
// tokens so it reads correctly in light mode too.
const FIELD_STYLE: React.CSSProperties = {
  background: 'var(--bg-2)',
  border: '1px solid var(--border-1)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-1)',
  fontSize: 10,
  padding: '6px 10px',
  outline: 'none',
  ...MONO,
}

interface LeftRailingProps {
  tree: FileTreeNode[]
  archivedEntries: ArchiveEntry[]
  activePath: string
  /** Every open tab's path (the active one included) — all render at the brightest text tier, above NEW-but-unopened files, which in turn sit above plain older files. */
  openPaths: Set<string>
  newPaths: Set<string>
  onSelectFile: (file: { name: string; path: string }) => void
  onChanged: () => void
  width: number
  /** Optional action control (e.g. the Refactor button) rendered in the header row, next to the "+" button. */
  headerAction?: ReactNode
  /** The library's root folder (e.g. '02_components' or '02_components_myLibrary') — drives the header label and where root-level creates land. */
  rootPath?: string
  /** Overrides the displayed header label without affecting `rootPath`'s role in create paths — e.g. Workspace shows the open folder's name here while rootPath itself stays ''. */
  rootLabel?: string
  /** Hides every create/archive/restore affordance (root "+", per-row "+"/"×", the archived section) — for widgets browsing a folder they can't or shouldn't mutate (e.g. node_modules). */
  readOnly?: boolean
  /** Hides the header's root "+" — for callers (Workspace) that already provide their own Add file / Add folder header buttons, so it isn't shown twice. */
  hideRootCreate?: boolean
  /** Tier filter chips shown in the search row. Defaults to the Components/Prototypes atom-molecule-organism-template-page set; pass [] to hide the filter control entirely for a widget where tiering is meaningless (e.g. Docker). */
  tierFilterOptions?: { id: string; label: string }[]
  /**
   * Per-folder hover action (e.g. a Play button that launches a curated
   * full-screen prototype) — called with a directory node's path/name,
   * return null/undefined for folders with no such action. Shown
   * regardless of `readOnly` (it's not a mutation). Kept generic/optional
   * so LeftRailing itself stays agnostic of what "launchable" means to any
   * particular caller.
   */
  folderAction?: (path: string, name: string) => { icon: IconName; title: string; onClick: () => void } | null | undefined
  /**
   * Per-file hover action (e.g. a Play button on a prototype file that
   * launches its containing folder) — same shape/rendering as
   * `folderAction`, just for file leaves instead of dirs.
   */
  fileAction?: (path: string, name: string) => { icon: IconName; title: string; onClick: () => void } | null | undefined
  /**
   * "Add to plan" — unlike folderAction/fileAction, this is a second,
   * always-present hover button on every row (not opt-in per caller), the
   * same way every widget gets it per the design. Called with the seed
   * file's own name for a file row, or every descendant file path for a dir
   * row (flattened here in LeftRailing against the untouched `tree` prop —
   * see handleAddToPlan below — never against a search/tier-filtered view).
   * Optional — omit to hide the hover button entirely (e.g. the Workspace
   * view, where an arbitrary external file has no relationship to Sleipnir's
   * own graph/notes system).
   */
  onAddToPlan?: (label: string, paths: string[]) => void
  /** Creates a new file at `path` (optionally with `content`) — defaults to the SRC_ROOT-scoped sleipnirApi.createFile, so every existing caller is unchanged. Workspace passes its own workspace-scoped equivalent. */
  createFile?: (path: string, content?: string) => Promise<void>
  createDir?: (path: string) => Promise<void>
  /** Runs after any create/restore mutation, before `onChanged` — defaults to today's `regenerateGraph().catch(()=>{})`. Workspace passes a no-op (nothing to regenerate for an arbitrary external file). */
  onMutated?: () => Promise<void>
  /** Shows the per-row/root archive "×" and the ARCHIVED section. Defaults to true (today's behavior). Workspace passes false — no archive/delete support for arbitrary external folders in Phase 0. */
  supportsArchive?: boolean
  /** Enables the right-click "Delete" context menu on every row — undefined (the default) hides it entirely, same opt-in shape as createFile/createDir. Workspace/Research pass their workspace-scoped deleteWorkspacePath; scope:'src'/'repo' callers don't, since there's no equivalent permanent-delete backend for those roots today. */
  deletePath?: (path: string) => Promise<void>
  /** Fired right after a successful delete, before onChanged's refresh — lets the caller close any open tab(s) under the deleted path so they don't dangle pointing at a file that no longer exists. */
  onDeleted?: (path: string, isDir: boolean) => void
  /** Resolves the plan node(s) scaffolded from a path (for a folder, from any file under it) so a file/folder delete can offer the inverse of DeleteNodeModal's "…+ Delete File": "…+ Delete Node". Undefined (or a resolver returning []) keeps the delete modal a plain single-button confirm. Workspace supplies this (see FolderBrowserView); scope:'src'/'repo' callers don't — a plan node's filePath is Workspace-relative. */
  findPlanNodes?: (path: string, isDir: boolean) => Promise<GraphNode[]>
  /** Permanently deletes the given plan node ids — paired with findPlanNodes for the "…+ node" delete branch. */
  deletePlanNodes?: (ids: string[]) => Promise<void>
}

function isAncestorOf(dirPath: string, targetPath: string): boolean {
  return targetPath === dirPath || targetPath.startsWith(`${dirPath}/`)
}

function findNodeByPath(nodes: FileTreeNode[], targetPath: string): FileTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === targetPath) return node
    if (node.children) {
      const found = findNodeByPath(node.children, targetPath)
      if (found) return found
    }
  }
  return undefined
}

function collectFilePaths(node: FileTreeNode, into: string[]) {
  if (node.type === 'file') {
    into.push(node.path)
    return
  }
  for (const child of node.children ?? []) collectFilePaths(child, into)
}

const parentDir = (p: string): string => {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.slice(0, i) : ''
}
const baseName = (p: string): string => {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.slice(i + 1) : p
}
const joinPath = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name)

// Pick a name not already used among `siblings`, appending " copy"/" copy N"
// before any extension — the paste conflict policy (never overwrite).
function deconflictName(base: string, siblings: FileTreeNode[]): string {
  const names = new Set(siblings.map((s) => s.name))
  if (!names.has(base)) return base
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ''
  let candidate = `${stem} copy${ext}`
  let i = 2
  while (names.has(candidate)) candidate = `${stem} copy ${i++}${ext}`
  return candidate
}

// Keeps a node if its own name matches, or (for dirs) if any descendant
// matches — so a hit deep in the tree still surfaces its parent folders.
function filterTreeByQuery(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  const walk = (list: FileTreeNode[]): FileTreeNode[] =>
    list.reduce<FileTreeNode[]>((acc, node) => {
      if (node.type === 'dir') {
        const children = walk(node.children ?? [])
        if (children.length > 0 || node.name.toLowerCase().includes(q)) {
          acc.push({ ...node, children })
        }
      } else if (node.name.toLowerCase().includes(q)) {
        acc.push(node)
      }
      return acc
    }, [])
  return walk(nodes)
}

type SortOrder = 'name' | 'recent'

// Same dirs-first grouping tools/sleipnir-backend.mjs's buildTree already
// applies server-side — only the ordering *within* each group is
// user-selectable (name vs. most-recently-created first). Re-sorting
// client-side (rather than threading the choice through listDir/listRepoDir)
// keeps this a pure display preference with no backend round-trip.
function sortTree(nodes: FileTreeNode[], order: SortOrder): FileTreeNode[] {
  const compare = (a: FileTreeNode, b: FileTreeNode) =>
    order === 'name' ? a.name.localeCompare(b.name) : b.createdAt - a.createdAt
  const dirs = nodes.filter((n) => n.type === 'dir').sort(compare)
  const files = nodes.filter((n) => n.type === 'file').sort(compare)
  return [...dirs, ...files].map((n) => (n.children ? { ...n, children: sortTree(n.children, order) } : n))
}

const TIER_FILTER_OPTIONS = [
  { id: 'atom', label: 'Atoms' },
  { id: 'molecule', label: 'Molecules' },
  { id: 'organism', label: 'Organisms' },
  { id: 'template', label: 'Templates' },
  { id: 'page', label: 'Pages' },
]

// FileTreeNode has no `type` field (only GraphNode does) — mirrors
// generate-graph.mjs's typeForId's substring-match convention against the
// real path, since a file leaf's `path` already encodes its tier segment.
function tierForPath(path: string): string | null {
  if (path.includes('01_atoms')) return 'atom'
  if (path.includes('02_molecules')) return 'molecule'
  if (path.includes('03_organisms')) return 'organism'
  if (path.includes('04_templates')) return 'template'
  if (path.includes('05_pages')) return 'page'
  return null
}

// Same recursive-preserve-parent shape as filterTreeByQuery — a dir survives
// if any descendant file matches one of the active tiers.
function filterTreeByTier(nodes: FileTreeNode[], activeTiers: string[]): FileTreeNode[] {
  if (activeTiers.length === 0) return nodes
  const walk = (list: FileTreeNode[]): FileTreeNode[] =>
    list.reduce<FileTreeNode[]>((acc, node) => {
      if (node.type === 'dir') {
        const children = walk(node.children ?? [])
        if (children.length > 0) acc.push({ ...node, children })
      } else {
        const tier = tierForPath(node.path)
        if (tier === null || activeTiers.includes(tier)) acc.push(node)
      }
      return acc
    }, [])
  return walk(nodes)
}

async function afterMutation(onMutated: () => Promise<void>, onChanged: () => void) {
  await onMutated()
  onChanged()
}

function InlineCreateForm({
  dirPath,
  depth,
  kind,
  onDone,
  onChanged,
  createFile,
  createDir,
  onMutated,
}: {
  dirPath: string
  depth: number
  /** Forces the created entry's type (from the row's Add file/Add folder menu).
   *  Omitted = the legacy heuristic: a name with a "." is a file, else a folder. */
  kind?: 'file' | 'folder'
  onDone: () => void
  onChanged: () => void
  createFile: (path: string, content?: string) => Promise<void>
  createDir: (path: string) => Promise<void>
  onMutated: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name) return
    try {
      const asFile = kind ? kind === 'file' : name.includes('.')
      const full = dirPath ? `${dirPath}/${name}` : name
      if (asFile) await createFile(full)
      else await createDir(full)
      onDone()
      await afterMutation(onMutated, onChanged)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const placeholder = kind === 'file' ? 'file name (e.g. Cart.tsx)' : kind === 'folder' ? 'folder name' : 'name or name.tsx'

  return (
    <Frame flow="vertical" gap={2} padding={{ left: 8 + depth * 14 + 18, right: 8, top: 2, bottom: 4 }}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') onDone()
        }}
        onBlur={() => !name && onDone()}
        placeholder={placeholder}
        style={FIELD_STYLE}
      />
      {error && <span style={{ fontSize: 11, color: '#e07a7a', ...MONO }}>{error}</span>}
    </Frame>
  )
}

function TreeNodeRow({
  node,
  depth,
  activePath,
  openPaths,
  newPaths,
  fileStages,
  onSelectFile,
  onChanged,
  forceExpanded,
  readOnly,
  folderAction,
  fileAction,
  onAddToPlan,
  createFile,
  createDir,
  onMutated,
  supportsArchive,
  onContextMenu,
  pendingCreate,
  onPendingCreateConsumed,
}: {
  node: FileTreeNode
  depth: number
  activePath: string
  openPaths: Set<string>
  newPaths: Set<string>
  /** filePath → planning stage of the plan node a file backs (see useFileStages) — shows the file's planning status at rest. */
  fileStages: Map<string, NodeStage>
  onSelectFile: (file: { name: string; path: string }) => void
  onChanged: () => void
  forceExpanded?: boolean
  readOnly?: boolean
  folderAction?: (path: string, name: string) => { icon: IconName; title: string; onClick: () => void } | null | undefined
  fileAction?: (path: string, name: string) => { icon: IconName; title: string; onClick: () => void } | null | undefined
  /** Reports this row back to LeftRailing for flattening/dispatch — see LeftRailing's handleAddToPlan. Doesn't flatten or dispatch itself. Undefined hides the hover button entirely. */
  onAddToPlan?: (path: string, name: string, isDir: boolean) => void
  createFile: (path: string, content?: string) => Promise<void>
  createDir: (path: string) => Promise<void>
  onMutated: () => Promise<void>
  supportsArchive: boolean
  /** Reports a right-click on this row back to LeftRailing, which owns the actual context-menu/delete-modal state — undefined (when the caller didn't pass `deletePath`) leaves the native browser context menu untouched. */
  onContextMenu?: (e: React.MouseEvent, node: FileTreeNode) => void
  /** A pending "Add file"/"Add folder" from some row's context menu — the folder it targets opens its inline create form with the given kind. */
  pendingCreate?: { path: string; kind: 'file' | 'folder' } | null
  onPendingCreateConsumed?: () => void
}) {
  const [expanded, setExpanded] = useState(() => isAncestorOf(node.path, activePath))
  const isExpanded = forceExpanded || expanded
  // null = not creating; 'auto' = the "." heuristic (the per-row "+"); 'file'/
  // 'folder' = an explicit kind from the context menu.
  const [creating, setCreating] = useState<'file' | 'folder' | 'auto' | null>(null)
  const isNew = newPaths.has(node.path)

  // This folder is the target of a context-menu "Add file/folder" — expand and
  // open its inline create form with the chosen kind, then clear the request.
  useEffect(() => {
    if (pendingCreate && node.type === 'dir' && pendingCreate.path === node.path) {
      setExpanded(true)
      setCreating(pendingCreate.kind)
      onPendingCreateConsumed?.()
    }
  }, [pendingCreate, node.path, node.type, onPendingCreateConsumed])

  const archive = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await setArchived(node.path, true, node.name)
    await afterMutation(onMutated, onChanged)
  }

  if (node.type === 'dir') {
    const action = folderAction?.(node.path, node.name)
    // A dir isn't "active" itself (only file leaves are), but it should
    // still read as slightly highlighted while it's an ancestor of the
    // active file, so you can trace the selection back up the tree.
    const containsActive = node.path !== activePath && isAncestorOf(node.path, activePath)
    return (
      <Frame flow="vertical" gap={0} w="fill">
        <ListRow
          indent={8 + depth * 14}
          // An ancestor of the active file stays a touch brighter so you can
          // trace the selection up the tree; colour flips via `.srow`.
          labelOpacity={containsActive ? 1 : 0.8}
          onClick={() => setExpanded((v) => !v)}
          onContextMenu={onContextMenu ? (e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, node) } : undefined}
          leading={
            <span style={{ opacity: 0.7, width: 8, display: 'inline-block', flexShrink: 0 }}>{isExpanded ? '▾' : '▸'}</span>
          }
          iconStart={<Icon name="folder" size={16} />}
          trailing={(hovered) => (
            <>
              {/* NEW chip at rest; hidden on hover so the action buttons take
                  that space. */}
              {isNew && !hovered && <Chip variant="new">NEW</Chip>}
              {(hovered || containsActive) && action && (
                <IconButton onClick={(e) => { e.stopPropagation(); action.onClick() }} title={action.title} icon={action.icon} />
              )}
              {hovered && onAddToPlan && (
                <IconButton onClick={(e) => { e.stopPropagation(); onAddToPlan(node.path, node.name, true) }} title="Add to plan" icon="plan-node-add" />
              )}
              {/* Per-row "+" only when there's no context menu to host create
                  (Components/Docker); Workspace/Research use the menu's Add
                  file / Add folder instead. */}
              {!readOnly && !onContextMenu && hovered && (
                <IconButton onClick={(e) => { e.stopPropagation(); setCreating('auto') }} title="New file/folder" glyph="+" iconSize={17} textColor="var(--text-3)" />
              )}
              {supportsArchive && !readOnly && hovered && (
                <IconButton onClick={archive} title="Remove" glyph="×" iconSize={16} textColor="var(--text-3)" />
              )}
              {onContextMenu && hovered && (
                <IconButton onClick={(e) => { e.stopPropagation(); onContextMenu(e, node) }} title="More actions" glyph="⋯" iconSize={16} textColor="var(--text-3)" />
              )}
            </>
          )}
        >
          {node.name}
        </ListRow>
        {creating && (
          <InlineCreateForm
            dirPath={node.path}
            depth={depth + 1}
            kind={creating === 'auto' ? undefined : creating}
            onDone={() => setCreating(null)}
            onChanged={onChanged}
            createFile={createFile}
            createDir={createDir}
            onMutated={onMutated}
          />
        )}
        {isExpanded && node.children?.map((child) => (
          <TreeNodeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            openPaths={openPaths}
            newPaths={newPaths}
            fileStages={fileStages}
            onSelectFile={onSelectFile}
            onChanged={onChanged}
            forceExpanded={forceExpanded}
            readOnly={readOnly}
            folderAction={folderAction}
            fileAction={fileAction}
            onAddToPlan={onAddToPlan}
            createFile={createFile}
            createDir={createDir}
            onMutated={onMutated}
            supportsArchive={supportsArchive}
            onContextMenu={onContextMenu}
            pendingCreate={pendingCreate}
            onPendingCreateConsumed={onPendingCreateConsumed}
          />
        ))}
      </Frame>
    )
  }

  const isActive = node.path === activePath
  const isOpen = openPaths.has(node.path)
  // Brightness tiers, now carried by opacity so the label colour can still flip
  // to the ground colour on the filled hover/selected states (see .srow /
  // item-states.css): selected/open files are brightest, a NEW-but-never-opened
  // file a step down, everything else the base dim. Hover brightens to full.
  const tierOpacity = isActive || isOpen ? 1 : isNew ? 0.78 : 0.55
  const action = fileAction?.(node.path, node.name)

  return (
    <ListRow
      selected={isActive}
      // Same left base as a folder row at this depth; the 8px spacer in leading
      // stands in for the folder's chevron so the file icon lines up directly
      // under folder icons and the name reads left-aligned right beside it.
      indent={8 + depth * 14}
      labelOpacity={tierOpacity}
      onClick={() => onSelectFile({ name: node.name.replace(/\.tsx?$/, ''), path: node.path })}
      onContextMenu={onContextMenu ? (e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, node) } : undefined}
      leading={<span style={{ width: 8, flexShrink: 0 }} />}
      iconStart={<Icon name="file" size={16} />}
      trailing={(hovered) => (
        <>
          {isNew && !hovered && <Chip variant="new">NEW</Chip>}
          {/* Planning status of the plan node this file backs, at rest — the same
              glyph the planning list and git view show; 'proposed' by default. */}
          {!hovered && <StatusGlyph stage={fileStages.get(node.path)} />}
          {hovered && action && (
            <IconButton onClick={(e) => { e.stopPropagation(); action.onClick() }} title={action.title} icon={action.icon} />
          )}
          {hovered && onAddToPlan && (
            <IconButton onClick={(e) => { e.stopPropagation(); onAddToPlan(node.path, node.name, false) }} title="Add to plan" icon="plan-node-add" />
          )}
          {supportsArchive && !readOnly && hovered && (
            <IconButton onClick={archive} title="Remove" glyph="×" iconSize={16} textColor="var(--text-3)" />
          )}
          {onContextMenu && hovered && (
            <IconButton onClick={(e) => { e.stopPropagation(); onContextMenu(e, node) }} title="More actions" glyph="⋯" iconSize={16} textColor="var(--text-3)" />
          )}
        </>
      )}
    >
      {node.name}
    </ListRow>
  )
}

export const LeftRailing = ({
  tree,
  archivedEntries,
  activePath,
  openPaths,
  newPaths,
  onSelectFile,
  onChanged,
  width,
  headerAction,
  rootPath = '02_components',
  rootLabel,
  readOnly,
  hideRootCreate,
  tierFilterOptions = TIER_FILTER_OPTIONS,
  folderAction,
  fileAction,
  onAddToPlan,
  createFile = createSrcFile,
  createDir = createSrcDir,
  onMutated = async () => { await regenerateGraph().catch(() => {}) },
  supportsArchive = true,
  deletePath,
  onDeleted,
  findPlanNodes,
  deletePlanNodes,
}: LeftRailingProps) => {
  // filePath → planning stage of the plan node a file backs — so every file row
  // shows its planning status at rest, the same glyph the planning list and git
  // view use. Empty for files that back no node.
  const fileStages = useFileStages()
  // null = not creating; 'auto' = the "." heuristic (the root "+"); 'file'/
  // 'folder' = an explicit kind routed here from a root-level row's menu.
  const [rootCreating, setRootCreating] = useState<'file' | 'folder' | 'auto' | null>(null)
  // A row's "Add file"/"Add folder" menu action targets a specific folder — the
  // matching TreeNodeRow picks this up, expands, and opens its inline create
  // form with the chosen kind (then clears it via onPendingCreateConsumed).
  const [pendingCreate, setPendingCreate] = useState<{ path: string; kind: 'file' | 'folder' } | null>(null)
  // A pendingCreate that targets the root itself (a top-level row's parent) has
  // no TreeNodeRow to catch it, so route it to the root create form here.
  useEffect(() => {
    if (pendingCreate && (pendingCreate.path === '' || pendingCreate.path === rootPath)) {
      setRootCreating(pendingCreate.kind)
      setPendingCreate(null)
    }
  }, [pendingCreate, rootPath])
  const [query, setQuery] = useState('')
  const [tierFilter, setTierFilter] = useState<string[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const searchContainerRef = useRef<HTMLElement>(null)
  // Local display preference, not persisted — resets to Name on remount,
  // same as this component's other view-only state (treeWidth etc.).
  const [sortOrder, setSortOrder] = useState<SortOrder>('name')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; anchorEl: HTMLElement; node: FileTreeNode } | null>(null)

  useEffect(() => {
    if (!searchOpen) return
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Element
      if (searchContainerRef.current?.contains(t)) return
      if (t.closest('[data-floating-menu]')) return
      setSearchOpen(false)
      setQuery('')
      setTierFilter([])
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [searchOpen])
  const [deletingNode, setDeletingNode] = useState<FileTreeNode | null>(null)
  // Plan node(s) scaffolded from the file/folder being deleted — resolved
  // fresh each time the delete modal opens (see the effect below), so the
  // "…+ Delete Node" choice reflects the current graph even for a node
  // scaffolded elsewhere this session. Empty until the async lookup resolves,
  // so the option pops in a beat after the modal appears rather than blocking
  // it.
  const [deletingPlanNodes, setDeletingPlanNodes] = useState<GraphNode[]>([])
  const [renamingNode, setRenamingNode] = useState<FileTreeNode | null>(null)

  useEffect(() => {
    if (!deletingNode || !findPlanNodes) {
      setDeletingPlanNodes([])
      return
    }
    let cancelled = false
    findPlanNodes(deletingNode.path, deletingNode.type === 'dir')
      .then((nodes) => { if (!cancelled) setDeletingPlanNodes(nodes) })
      .catch(() => { if (!cancelled) setDeletingPlanNodes([]) })
    return () => { cancelled = true }
  }, [deletingNode, findPlanNodes])
  // Subscribe so the "Paste" item enables/disables the moment something is
  // cut/copied anywhere (including the sibling Workspace/Research tree).
  const clipboard = useFileClipboard()

  const restore = async (path: string) => {
    await setArchived(path, false)
    await afterMutation(onMutated, onChanged)
  }

  const handleRowContextMenu = (e: React.MouseEvent, node: FileTreeNode) => {
    setContextMenu({ x: e.clientX, y: e.clientY, anchorEl: e.currentTarget as HTMLElement, node })
  }

  const childrenOf = (dir: string): FileTreeNode[] =>
    dir === '' || dir === rootPath ? tree : (findNodeByPath(tree, dir)?.children ?? [])

  // Paste the clipboard entry into `destDir` (a folder path, or the parent dir
  // of a file row). Cut = move (then clear); copy = duplicate (keep). Names are
  // de-conflicted so a paste never overwrites; a folder can't be pasted into
  // itself or a descendant.
  const pasteInto = async (destDir: string) => {
    const c = getFileClipboard()
    if (!c) return
    if (c.isDir && isAncestorOf(c.path, destDir)) return
    const dest = joinPath(destDir, deconflictName(baseName(c.path), childrenOf(destDir)))
    if (c.mode === 'cut') {
      await renameWorkspacePath(c.path, dest)
      setFileClipboard(null)
    } else {
      await copyWorkspacePath(c.path, dest)
    }
    await afterMutation(onMutated, onChanged)
  }

  const copyRelativePath = (node: FileTreeNode) => { void navigator.clipboard.writeText(node.path) }
  const copyAbsolutePath = async (node: FileTreeNode) => {
    const info = await getWorkspaceInfo()
    void navigator.clipboard.writeText(info.root ? `${info.root}/${node.path}` : node.path)
  }

  // For a file, the seed is just that one path. For a dir, every descendant
  // file needs to be seeded too — looked up in the untouched `tree` prop
  // (not `visibleTree` below), so an active search/tier filter never causes
  // "add to plan" on a folder to silently seed only a filtered subset.
  // Undefined (not called) when the caller omitted onAddToPlan entirely —
  // TreeNodeRow only renders the hover button when this itself is defined.
  const handleAddToPlan = onAddToPlan
    ? (path: string, name: string, isDir: boolean) => {
        if (!isDir) {
          onAddToPlan(name, [path])
          return
        }
        const node = findNodeByPath(tree, path)
        const paths: string[] = []
        if (node) collectFilePaths(node, paths)
        onAddToPlan(name, paths)
      }
    : undefined

  const visibleTree = sortTree(filterTreeByTier(filterTreeByQuery(tree, query), tierFilter), sortOrder)

  return (
    <>
    <ScrollWindow axis="y" flow="vertical" gap={0} minH={0} w={width} shrink={0} padding={{ y: 16 }}>
      <Frame ref={searchContainerRef} padding={{ x: 8, bottom: 10 }}>
        <SidebarHeader
        label={(rootLabel ?? rootPath).toUpperCase()}
        searchOpen={searchOpen || !!query}
        actions={
        <Frame flow="horizontal" align="center" gap={2} shrink={0}>
          {headerAction}
          <Dropdown
            options={[{ value: 'name', label: 'Name' }, { value: 'recent', label: 'Recently modified' }]}
            value={sortOrder}
            onChange={(v) => setSortOrder((Array.isArray(v) ? v[0] : v) as SortOrder)}
            variant="none"
            w="auto"
            trigger={<IconButton as="span" icon="settings" iconSize={16} title="Sort order" textColor="var(--text-3)" />}
          />
          {!searchOpen && !query && (
            <IconButton
              as="span"
              icon="search"
              iconSize={14}
              title="Search files"
              textColor="var(--text-3)"
              onClick={() => setSearchOpen(true)}
            />
          )}
          {!readOnly && !hideRootCreate && (
            <IconButton
              onClick={() => setRootCreating((v) => (v ? null : 'auto'))}
              title="New file/folder"
              glyph="+"
              iconSize={17}
              textColor="var(--text-2)"
            />
          )}
        </Frame>
        }
        search={
          <Search
            value={query}
            onChange={setQuery}
            placeholder={`Search in ${rootLabel ?? rootPath}…`}
            w="fill"
            autoFocus={searchOpen && !query}
            filters={tierFilterOptions.length > 0 ? { options: tierFilterOptions, active: tierFilter, onChange: setTierFilter } : undefined}
          />
        }
      />
      </Frame>
      {!readOnly && rootCreating && (
        <InlineCreateForm
          dirPath={rootPath}
          depth={0}
          kind={rootCreating === 'auto' ? undefined : rootCreating}
          onDone={() => setRootCreating(null)}
          onChanged={onChanged}
          createFile={createFile}
          createDir={createDir}
          onMutated={onMutated}
        />
      )}

      {visibleTree.map((node) => (
        <TreeNodeRow
          key={node.path}
          node={node}
          depth={0}
          activePath={activePath}
          openPaths={openPaths}
          newPaths={newPaths}
          fileStages={fileStages}
          onSelectFile={onSelectFile}
          onChanged={onChanged}
          forceExpanded={query.trim().length > 0}
          readOnly={readOnly}
          folderAction={folderAction}
          fileAction={fileAction}
          onAddToPlan={handleAddToPlan}
          createFile={createFile}
          createDir={createDir}
          onMutated={onMutated}
          supportsArchive={supportsArchive}
          onContextMenu={deletePath && !readOnly ? handleRowContextMenu : undefined}
          pendingCreate={pendingCreate}
          onPendingCreateConsumed={() => setPendingCreate(null)}
        />
      ))}

      {supportsArchive && !readOnly && archivedEntries.length > 0 && (
        <Frame flow="vertical" gap={0} padding={{ top: 12 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', padding: '0 8px 4px', ...MONO }}>
            ARCHIVED ({archivedEntries.length})
          </span>
          {archivedEntries.map((entry) => (
            <Frame
              key={entry.path}
              as="button"
              onClick={() => restore(entry.path)}
              title="Restore"
              flow="horizontal"
              align="center"
              minH={28}
              w="fill"
              variant="none"
              hoverFill="bg-3"
              radius={0}
              padding={{ x: 8, y: 6 }}
              cursor="pointer"
              textColor="var(--text-3)"
              style={{
                textAlign: 'left',
                fontSize: 12,
                letterSpacing: '0.02em',
                textDecoration: 'line-through',
                opacity: 0.6,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                ...MONO,
              }}
            >
              {entry.label}
            </Frame>
          ))}
        </Frame>
      )}
    </ScrollWindow>

    {contextMenu && (
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        anchorEl={contextMenu.anchorEl}
        onClose={() => setContextMenu(null)}
        items={((): ContextMenuItem[] => {
          // Create target: inside a folder row, or in a file row's parent folder
          // (a root-level row's parent is the root — routed via pendingCreate).
          const createDir = contextMenu.node.type === 'dir' ? contextMenu.node.path : parentDir(contextMenu.node.path)
          return [
          { label: 'Add file', icon: 'file-add', onSelect: () => setPendingCreate({ path: createDir, kind: 'file' }) },
          { label: 'Add folder', icon: 'folder-add', onSelect: () => setPendingCreate({ path: createDir, kind: 'folder' }) },
          { label: 'Rename', separator: true, onSelect: () => setRenamingNode(contextMenu.node) },
          { label: 'Cut', separator: true, onSelect: () => setFileClipboard({ path: contextMenu.node.path, isDir: contextMenu.node.type === 'dir', mode: 'cut' }) },
          { label: 'Copy', onSelect: () => setFileClipboard({ path: contextMenu.node.path, isDir: contextMenu.node.type === 'dir', mode: 'copy' }) },
          {
            label: 'Paste',
            disabled: !clipboard,
            onSelect: () => pasteInto(contextMenu.node.type === 'dir' ? contextMenu.node.path : parentDir(contextMenu.node.path)),
          },
          { label: 'Copy path', separator: true, onSelect: () => copyAbsolutePath(contextMenu.node) },
          { label: 'Copy relative path', onSelect: () => copyRelativePath(contextMenu.node) },
          {
            label: contextMenu.node.type === 'dir' ? 'Delete Folder' : 'Delete File',
            separator: true,
            destructive: true,
            onSelect: () => setDeletingNode(contextMenu.node),
          },
        ]
        })()}
      />
    )}

    {renamingNode && (
      <RenamePathModal
        name={renamingNode.name}
        isDir={renamingNode.type === 'dir'}
        rename={(newName) => renameWorkspacePath(renamingNode.path, joinPath(parentDir(renamingNode.path), newName))}
        onClose={() => setRenamingNode(null)}
        onRenamed={async () => {
          setRenamingNode(null)
          await afterMutation(onMutated, onChanged)
        }}
      />
    )}

    {deletingNode && deletePath && (
      <DeletePathModal
        path={deletingNode.path}
        name={deletingNode.name}
        isDir={deletingNode.type === 'dir'}
        deletePath={deletePath}
        planNodes={deletingPlanNodes}
        deletePlanNodes={deletePlanNodes}
        onClose={() => setDeletingNode(null)}
        onDeleted={async () => {
          const { path, type } = deletingNode
          setDeletingNode(null)
          onDeleted?.(path, type === 'dir')
          await afterMutation(onMutated, onChanged)
        }}
      />
    )}
    </>
  )
}
