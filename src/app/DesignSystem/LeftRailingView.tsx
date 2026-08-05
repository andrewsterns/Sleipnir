import { useState, type ReactNode } from 'react'
import { Frame } from '../01_atoms/Frame/Frame'
import { Icon } from '../01_atoms/Icon/Icon'
import { Chip } from '../02_molecules/Chip/Chip'
import { Search } from '../02_molecules/Search/Search'
import { ScrollWindow } from '../02_molecules/ScrollWindow/ScrollWindow'
import {
  createFile,
  createDir,
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
}

function isAncestorOf(dirPath: string, targetPath: string): boolean {
  return targetPath === dirPath || targetPath.startsWith(`${dirPath}/`)
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

async function afterMutation(onChanged: () => void) {
  await regenerateGraph().catch(() => {})
  onChanged()
}

function InlineCreateForm({
  dirPath,
  depth,
  onDone,
  onChanged,
}: {
  dirPath: string
  depth: number
  onDone: () => void
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name) return
    try {
      if (name.includes('.')) await createFile(`${dirPath}/${name}`)
      else await createDir(`${dirPath}/${name}`)
      onDone()
      await afterMutation(onChanged)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

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
        placeholder="name or name.tsx"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: 'var(--text-1)',
          fontSize: 10,
          padding: '3px 6px',
          ...MONO,
        }}
      />
      {error && <span style={{ fontSize: 9, color: '#e07a7a', ...MONO }}>{error}</span>}
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
}: {
  node: FileTreeNode
  depth: number
  activePath: string
  newPaths: Set<string>
  onSelectFile: (file: { name: string; path: string }) => void
  onChanged: () => void
  forceExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(() => isAncestorOf(node.path, activePath))
  const isExpanded = forceExpanded || expanded
  const [hovered, setHovered] = useState(false)
  const [creating, setCreating] = useState(false)
  const isNew = newPaths.has(node.path)

  const archive = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await setArchived(node.path, true, node.name)
    await afterMutation(onChanged)
  }

  if (node.type === 'dir') {
    return (
      <Frame flow="vertical" gap={0} w="fill">
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{ display: 'flex', alignItems: 'center', width: '100%' }}
        >
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: `4px 4px 4px ${8 + depth * 14}px`,
              color: 'var(--text-2)',
              fontSize: 10,
              letterSpacing: '0.04em',
              ...MONO,
            }}
          >
            <span style={{ opacity: 0.7, width: 8, display: 'inline-block', flexShrink: 0 }}>{isExpanded ? '▾' : '▸'}</span>
            <Icon name="folder" size={12} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
            {isNew && <Chip variant="new">NEW</Chip>}
          </button>
          {hovered && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setCreating(true) }}
                title="New file/folder"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0 6px', fontSize: 12, ...MONO }}
              >
                +
              </button>
              <button
                onClick={archive}
                title="Remove"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0 8px 0 0', fontSize: 11, ...MONO }}
              >
                ×
              </button>
            </>
          )}
        </div>
        {creating && (
          <InlineCreateForm dirPath={node.path} depth={depth + 1} onDone={() => setCreating(false)} onChanged={onChanged} />
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
          />
        ))}
      </Frame>
    )
  }

  const isActive = node.path === activePath

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', width: '100%' }}
    >
      <button
        onClick={() => onSelectFile({ name: node.name.replace(/\.tsx?$/, ''), path: node.path })}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flex: 1,
          minWidth: 0,
          textAlign: 'left',
          background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: `4px 4px 4px ${8 + depth * 14 + 18}px`,
          color: isActive ? 'var(--text-1)' : 'var(--text-3)',
          fontSize: 10,
          letterSpacing: '0.02em',
          ...MONO,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
        {isNew && <Chip variant="new">NEW</Chip>}
      </button>
      {hovered && (
        <button
          onClick={archive}
          title="Remove"
          style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0 8px 0 0', fontSize: 11, ...MONO }}
        >
          ×
        </button>
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
}: LeftRailingProps) => {
  const [rootCreating, setRootCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [tierFilter, setTierFilter] = useState<string[]>([])

  const restore = async (path: string) => {
    await setArchived(path, false)
    await afterMutation(onChanged)
  }

  const visibleTree = filterTreeByTier(filterTreeByQuery(tree, query), tierFilter)

  return (
    <ScrollWindow axis="y" flow="vertical" gap={0} minH={0} w={width} shrink={0} padding={{ y: 8 }}>
      <Frame flow="horizontal" align="center" justify="between" padding={{ x: 8, bottom: 4 }}>
        <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
          02_COMPONENTS
        </span>
        {headerAction}
        <button
          onClick={() => setRootCreating((v) => !v)}
          title="New file/folder"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)',
            color: 'var(--text-2)',
            fontSize: 10,
            lineHeight: 1,
            padding: '2px 6px',
            cursor: 'pointer',
            ...MONO,
          }}
        >
          +
        </button>
      </Frame>
      <Frame padding={{ x: 8, bottom: 8 }}>
        <Search
          value={query}
          onChange={setQuery}
          placeholder="Search files…"
          w="fill"
          filters={{ options: TIER_FILTER_OPTIONS, active: tierFilter, onChange: setTierFilter }}
        />
      </Frame>
      {rootCreating && (
        <InlineCreateForm dirPath="02_components" depth={0} onDone={() => setRootCreating(false)} onChanged={onChanged} />
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
        />
      ))}

      {archivedEntries.length > 0 && (
        <Frame flow="vertical" gap={0} padding={{ top: 12 }}>
          <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', padding: '0 8px 4px', ...MONO }}>
            ARCHIVED ({archivedEntries.length})
          </span>
          {archivedEntries.map((entry) => (
            <button
              key={entry.path}
              onClick={() => restore(entry.path)}
              title="Restore"
              style={{
                display: 'block',
                textAlign: 'left',
                width: '100%',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
                color: 'var(--text-3)',
                fontSize: 10,
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
            </button>
          ))}
        </Frame>
      )}
    </ScrollWindow>
  )
}
