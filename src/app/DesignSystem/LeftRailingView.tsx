import { useState, type ReactNode } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon, type IconName } from '../UIKit/Icon/Icon'
import { IconButton } from '../UIKit/IconButton/IconButton'
import { Chip } from '../UIKit/Chip/Chip'
import { Search } from '../UIKit/Search/Search'
import { ScrollWindow } from '../UIKit/ScrollWindow/ScrollWindow'
import {
  createFile as createSrcFile,
  createDir as createSrcDir,
  setArchived,
  regenerateGraph,
  type FileTreeNode,
  type ArchiveEntry,
} from '../../00_planning/api/sleipnirApi'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

interface LeftRailingProps {
  tree: FileTreeNode[]
  archivedEntries: ArchiveEntry[]
  activePath: string
  newPaths: Set<string>
  onSelectFile: (file: { name: string; path: string }) => void
  onChanged: () => void
  width: number
  /** Optional action control (e.g. the Refactor button) rendered in the header row, next to the "+" button. */
  headerAction?: ReactNode
  /** The library's root folder (e.g. '02_components' or '02_components_myLibrary') — drives the header label and where root-level creates land. */
  rootPath?: string
  /** Hides every create/archive/restore affordance (root "+", per-row "+"/"×", the archived section) — for widgets browsing a folder they can't or shouldn't mutate (e.g. node_modules). */
  readOnly?: boolean
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
  onDone,
  onChanged,
  createFile,
  createDir,
  onMutated,
}: {
  dirPath: string
  depth: number
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
      if (name.includes('.')) await createFile(`${dirPath}/${name}`)
      else await createDir(`${dirPath}/${name}`)
      onDone()
      await afterMutation(onMutated, onChanged)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Frame flow="vertical" gap={2} padding={{ left: 16 + depth * 14 + 18, right: 16, top: 2, bottom: 4 }}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') onDone()
        }}
        onBlur={() => !name && onDone()}
        placeholder="name or name.tsx"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: 'var(--text-1)',
          fontSize: 12,
          padding: '6px 8px',
          ...MONO,
        }}
      />
      {error && <span style={{ fontSize: 11, color: '#e07a7a', ...MONO }}>{error}</span>}
    </Frame>
  )
}

function TreeNodeRow({
  node,
  depth,
  activePath,
  newPaths,
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
}: {
  node: FileTreeNode
  depth: number
  activePath: string
  newPaths: Set<string>
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
}) {
  const [expanded, setExpanded] = useState(() => isAncestorOf(node.path, activePath))
  const isExpanded = forceExpanded || expanded
  const [hovered, setHovered] = useState(false)
  const [creating, setCreating] = useState(false)
  const isNew = newPaths.has(node.path)

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
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 28, gap: 2, background: containsActive ? 'rgba(255,255,255,0.03)' : 'transparent' }}
        >
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flex: 1,
              minWidth: 0,
              minHeight: 28,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: `6px 4px 6px ${16 + depth * 14}px`,
              color: containsActive ? 'var(--text-1)' : 'var(--text-2)',
              fontSize: 12,
              letterSpacing: '0.02em',
              ...MONO,
            }}
          >
            <span style={{ opacity: 0.7, width: 8, display: 'inline-block', flexShrink: 0 }}>{isExpanded ? '▾' : '▸'}</span>
            <Icon name="folder" size={16} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
            {isNew && <Chip variant="new">NEW</Chip>}
          </button>
          {(hovered || containsActive) && action && (
            <IconButton
              onClick={(e) => { e.stopPropagation(); action.onClick() }}
              title={action.title}
              icon={action.icon}
            />
          )}
          {hovered && onAddToPlan && (
            <IconButton
              onClick={(e) => { e.stopPropagation(); onAddToPlan(node.path, node.name, true) }}
              title="Add to plan"
              icon="plan-node-add"
            />
          )}
          {!readOnly && hovered && (
            <IconButton
              onClick={(e) => { e.stopPropagation(); setCreating(true) }}
              title="New file/folder"
              glyph="+"
              iconSize={17}
              textColor="var(--text-3)"
            />
          )}
          {supportsArchive && !readOnly && hovered && (
            <IconButton
              onClick={archive}
              title="Remove"
              glyph="×"
              iconSize={16}
              textColor="var(--text-3)"
            />
          )}
        </div>
        {creating && (
          <InlineCreateForm
            dirPath={node.path}
            depth={depth + 1}
            onDone={() => setCreating(false)}
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
            newPaths={newPaths}
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
          />
        ))}
      </Frame>
    )
  }

  const isActive = node.path === activePath
  const action = fileAction?.(node.path, node.name)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 28, gap: 2 }}
    >
      <button
        onClick={() => onSelectFile({ name: node.name.replace(/\.tsx?$/, ''), path: node.path })}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flex: 1,
          minWidth: 0,
          minHeight: 28,
          textAlign: 'left',
          background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: `6px 4px 6px ${16 + depth * 14 + 18}px`,
          color: isActive ? 'var(--text-1)' : 'var(--text-3)',
          fontSize: 12,
          letterSpacing: '0.02em',
          ...MONO,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
        {isNew && <Chip variant="new">NEW</Chip>}
      </button>
      {hovered && action && (
        <IconButton
          onClick={(e) => { e.stopPropagation(); action.onClick() }}
          title={action.title}
          icon={action.icon}
        />
      )}
      {hovered && onAddToPlan && (
        <IconButton
          onClick={(e) => { e.stopPropagation(); onAddToPlan(node.path, node.name, false) }}
          title="Add to plan"
          icon="plan-node-add"
        />
      )}
      {supportsArchive && !readOnly && hovered && (
        <IconButton
          onClick={archive}
          title="Remove"
          glyph="×"
          iconSize={16}
          textColor="var(--text-3)"
        />
      )}
    </div>
  )
}

export const LeftRailing = ({
  tree,
  archivedEntries,
  activePath,
  newPaths,
  onSelectFile,
  onChanged,
  width,
  headerAction,
  rootPath = '02_components',
  readOnly,
  tierFilterOptions = TIER_FILTER_OPTIONS,
  folderAction,
  fileAction,
  onAddToPlan,
  createFile = createSrcFile,
  createDir = createSrcDir,
  onMutated = async () => { await regenerateGraph().catch(() => {}) },
  supportsArchive = true,
}: LeftRailingProps) => {
  const [rootCreating, setRootCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [tierFilter, setTierFilter] = useState<string[]>([])
  // Local display preference, not persisted — resets to Name on remount,
  // same as this component's other view-only state (treeWidth etc.).
  const [sortOrder, setSortOrder] = useState<SortOrder>('name')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)

  const restore = async (path: string) => {
    await setArchived(path, false)
    await afterMutation(onMutated, onChanged)
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
    <ScrollWindow axis="y" flow="vertical" gap={0} minH={0} w={width} shrink={0} padding={{ y: 16 }}>
      <Frame flow="horizontal" align="center" justify="between" padding={{ x: 16, bottom: 10 }}>
        <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-2)', ...MONO }}>
          {rootPath.toUpperCase()}
        </span>
        <Frame flow="horizontal" align="center" gap={2} style={{ position: 'relative' }}>
          {headerAction}
          <IconButton
            onClick={() => setSortMenuOpen((v) => !v)}
            title="Sort order"
            icon="settings"
            textColor="var(--text-3)"
          />
          {!readOnly && (
            <IconButton
              onClick={() => setRootCreating((v) => !v)}
              title="New file/folder"
              glyph="+"
              iconSize={17}
              textColor="var(--text-2)"
            />
          )}
          {sortMenuOpen && (
            <Frame
              flow="vertical"
              gap={2}
              padding={6}
              style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 180, zIndex: 20 }}
              fill={{ solid: 'bg-2' }}
              stroke={{ color: 'rgba(255,255,255,0.15)' }}
              radius={4}
            >
              {([['name', 'Name'], ['recent', 'Recently modified']] as const).map(([value, label]) => (
                <Frame
                  key={value}
                  as="button"
                  onClick={() => { setSortOrder(value); setSortMenuOpen(false) }}
                  flow="horizontal"
                  align="center"
                  justify="between"
                  w="fill"
                  minH={28}
                  variant="none"
                  hoverFill="bg-3"
                  radius={4}
                  padding={{ x: 10, y: 6 }}
                  cursor="pointer"
                  textColor={sortOrder === value ? 'var(--text-1)' : 'var(--text-3)'}
                  style={{ textAlign: 'left', fontSize: 12, letterSpacing: '0.02em', ...MONO }}
                >
                  {label}
                  {sortOrder === value && <span>✓</span>}
                </Frame>
              ))}
            </Frame>
          )}
        </Frame>
      </Frame>
      <Frame padding={{ x: 16, bottom: 10 }}>
        <Search
          value={query}
          onChange={setQuery}
          placeholder="Search files…"
          w="fill"
          filters={tierFilterOptions.length > 0 ? { options: tierFilterOptions, active: tierFilter, onChange: setTierFilter } : undefined}
        />
      </Frame>
      {!readOnly && rootCreating && (
        <InlineCreateForm
          dirPath={rootPath}
          depth={0}
          onDone={() => setRootCreating(false)}
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
          newPaths={newPaths}
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
        />
      ))}

      {supportsArchive && !readOnly && archivedEntries.length > 0 && (
        <Frame flow="vertical" gap={0} padding={{ top: 12 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', padding: '0 16px 4px', ...MONO }}>
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
              padding={{ x: 16, y: 6 }}
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
  )
}
