import { useEffect, useRef, useState } from 'react'
import { Frame } from '../01_atoms/Frame/Frame'
import { Text } from '../01_atoms/Text/Text'
import { CodeEditorView } from './CodeEditorView'
import { LeftRailing } from './LeftRailingView'
import { ComponentPreview } from './ComponentPreviewView'
import { componentsList } from './DesignLibrary.ViewModel'
import { RefactorPanel } from '../02_molecules/RefactorPanel/RefactorPanel'
import {
  listDir,
  readFile,
  getArchivedPaths,
  isArchived,
  getLastVisit,
  setLastVisit,
  type FileTreeNode,
  type ArchiveEntry,
} from '../../00_planning/api/sleipnirApi'

const DEFAULT_FILE = { name: 'Frame', path: '02_components/01_atoms/Frame/Frame.tsx' }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

type DragTarget = 'tree' | 'preview' | null

function ResizeHandle({ axis, onMouseDown }: { axis: 'x' | 'y'; onMouseDown: (e: React.MouseEvent) => void }) {
  const [hover, setHover] = useState(false)
  const lineStyle: React.CSSProperties = {
    position: 'absolute',
    background: hover ? 'rgba(255,255,255,0.28)' : 'var(--border-1)',
    transition: 'background 80ms',
    ...(axis === 'x' ? { left: '50%', top: 0, bottom: 0, width: 1 } : { top: '50%', left: 0, right: 0, height: 1 }),
  }
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0,
        position: 'relative',
        cursor: axis === 'x' ? 'col-resize' : 'row-resize',
        ...(axis === 'x' ? { width: 8 } : { height: 8, width: '100%' }),
      }}
    >
      <div style={lineStyle} />
    </div>
  )
}

// Recursively drops any node (and its subtree) that falls under an archived path.
function filterArchived(nodes: FileTreeNode[], archivedEntries: ArchiveEntry[]): FileTreeNode[] {
  return nodes
    .filter((n) => !isArchived(n.path, archivedEntries))
    .map((n) => (n.children ? { ...n, children: filterArchived(n.children, archivedEntries) } : n))
}

function collectNewPaths(nodes: FileTreeNode[], since: number, into: Set<string>) {
  for (const n of nodes) {
    if (n.createdAt > since) into.add(n.path)
    if (n.children) collectNewPaths(n.children, since, into)
  }
}

export default function DesignLibraryView() {
  const [rawTree, setRawTree] = useState<FileTreeNode[]>([])
  const [archivedEntries, setArchivedEntries] = useState<ArchiveEntry[]>([])
  const [newPaths, setNewPaths] = useState<Set<string>>(new Set())
  const [activeFile, setActiveFile] = useState(DEFAULT_FILE)
  const [code, setCode] = useState('// Loading source…')

  const [treeWidth, setTreeWidth] = useState(260)
  const [previewHeight, setPreviewHeight] = useState(220)
  const dragRef = useRef<{ target: DragTarget; start: number; startSize: number }>({
    target: null,
    start: 0,
    startSize: 0,
  })

  // Captured once per session — every refresh (including ones triggered by
  // this session's own creates) recomputes "new" against the same baseline,
  // so something you just created shows NEW immediately. Only bumped in
  // localStorage on mount, so next session's baseline is "since last visit".
  const sessionLastVisitRef = useRef(getLastVisit())

  const refresh = () => {
    listDir('02_components').then(({ tree }) => {
      setRawTree(tree)
      const fresh = new Set<string>()
      collectNewPaths(tree, sessionLastVisitRef.current, fresh)
      setNewPaths(fresh)
    }).catch(() => {})
    getArchivedPaths().then(({ entries }) => setArchivedEntries(entries)).catch(() => {})
  }

  // Node = Component: the tree is the real filesystem, fetched fresh on
  // mount — anything scaffolded through Planning's "+" flow is just there.
  useEffect(() => {
    refresh()
    setLastVisit(Date.now())
  }, [])

  // Always the real, complete file — no curated/abbreviated stand-in.
  useEffect(() => {
    let cancelled = false
    setCode('// Loading source…')
    readFile(activeFile.path)
      .then(({ content }) => { if (!cancelled) setCode(content) })
      .catch((e) => { if (!cancelled) setCode(`// Failed to load source: ${e instanceof Error ? e.message : String(e)}`) })
    return () => { cancelled = true }
  }, [activeFile])

  const startDrag = (target: DragTarget, e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = {
      target,
      start: target === 'tree' ? e.clientX : e.clientY,
      startSize: target === 'tree' ? treeWidth : previewHeight,
    }
    document.body.style.cursor = target === 'tree' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const { target, start, startSize } = dragRef.current
      if (target === 'tree') setTreeWidth(clamp(startSize + (e.clientX - start), 180, 900))
      else if (target === 'preview') setPreviewHeight(clamp(startSize + (e.clientY - start), 120, 520))
    }
    const stopDrag = () => {
      if (!dragRef.current.target) return
      dragRef.current.target = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', stopDrag)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', stopDrag)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  // Clicking a component name inside the code panel jumps to that
  // component's main file, when we know where it lives.
  const selectByName = (name: string) => {
    const meta = componentsList.find((c) => c.name === name)
    if (meta) setActiveFile({ name: meta.name, path: meta.path })
  }

  const liveTree = filterArchived(rawTree, archivedEntries)

  return (
    <Frame theme="tactical" flow="horizontal" h="fill" w="fill" fill={{ solid: 'bg-1' }}>
      <LeftRailing
        tree={liveTree}
        headerAction={<RefactorPanel onApplied={refresh} />}
        archivedEntries={archivedEntries}
        activePath={activeFile.path}
        newPaths={newPaths}
        onSelectFile={setActiveFile}
        onChanged={refresh}
        width={treeWidth}
      />

      <ResizeHandle axis="x" onMouseDown={(e) => startDrag('tree', e)} />

      <Frame flow="vertical" gap={0} minH={0} minW={0} grow h="fill">
        <Frame w="fill" h={previewHeight} shrink={0}>
          <ComponentPreview
            activeComponent={activeFile.name}
            onActiveComponentChange={selectByName}
          />
        </Frame>

        <ResizeHandle axis="y" onMouseDown={(e) => startDrag('preview', e)} />

        {/* Code section — fills remaining height, scrolls internally */}
        <Frame
          flow="vertical"
          gap={0}
          grow
          minH={0}
          fill={{ solid: 'bg-1' }}
        >
          {/* Header bar */}
          <Frame
            flow="horizontal"
            align="center"
            justify="between"
            padding={{ x: 16, y: 10 }}
            stroke={{ bottom: { color: 'border-1' } }}
            fill={{ solid: 'bg-1' }}
          >
            <Text variant="xs" color="text-3" transform="uppercase" tracking="widest" mono>
              {activeFile.path}
            </Text>
            <Text variant="xs" color="text-3" transform="uppercase" tracking="widest" mono>
              JSX
            </Text>
          </Frame>

          {/* Editable code body */}
          <Frame grow minH={0}>
            <CodeEditorView path={activeFile.path} value={code} />
          </Frame>
        </Frame>
      </Frame>
    </Frame>
  )
}
