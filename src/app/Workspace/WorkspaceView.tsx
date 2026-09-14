import { forwardRef, useEffect, useRef, useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Button } from '../UIKit/Button/Button'
import { IconButton } from '../UIKit/IconButton/IconButton'
import { FolderBrowserView } from '../DesignSystem/FolderBrowserView'
import { useWorkspaceViewModel } from './WorkspaceView.ViewModel'
import { NewWorkspacePlanModal } from './NewWorkspacePlanModal'
import type { FolderBrowserHandle } from '../DesignSystem/iFolderBrowserView'
import type { WorkspaceViewProps } from './iWorkspaceView'
import { setNodeStatus, setNodeBorrows, createWorkspaceDir, createWorkspaceFile, getNotes, readWorkspaceFile } from '../../00_planning/api/sleipnirApi'
import { adapterForPath } from '../../00_planning/graph/importAdapters'
import { loadPathAliases } from '../../00_planning/graph/importAdapters/pathAliases'
import { usePlanNodeLinks } from '../../00_planning/usePlanNodeLinks'
import type { GraphNode } from '../../00_planning/graph/types'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Name-entry fields, styled to match the Search box (variant="surface"): a
// bg-2 surface with a border-1 hairline, the shared control radius, and 10px
// mono — theme-aware tokens, so they read correctly in light mode too.
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

// Electron-only, same feature-detection convention as App.tsx's
// electronDialogsAvailable — a plain browser dev tab has no native folder
// picker and no persisted "last workspace" (see electron/workspaceStore.cjs),
// so this category explains why it's disabled rather than silently no-oping
// on click.
const workspaceAvailable = typeof window.electronAPI?.openWorkspace === 'function'

// Header-row "add a folder at the project root" shortcut — a proper
// component (not an inline closure) so its own input/error state can use
// hooks normally; it's invoked via FolderBrowserView's headerAction render
// prop, which runs inside LeftRailing's render rather than owning its own.
// Switching to a *different* project entirely now lives solely in File >
// Open Project/Open Recent (see TitleBar) — this button's old "Switch
// Folder…" job, which the folder-add icon never actually looked like.
function AddFolderButton({ onCreated }: { onCreated: () => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setAdding(false)
    setName('')
    setError(null)
  }

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await createWorkspaceDir(trimmed)
      reset()
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!adding) {
    return <IconButton onClick={() => setAdding(true)} title="Add new folder" icon="folder-add" />
  }

  return (
    <Frame flow="horizontal" align="center" gap={4}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') reset()
        }}
        onBlur={() => { if (!name) reset() }}
        placeholder="folder name"
        style={{ ...FIELD_STYLE, width: 120 }}
      />
      {error && <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{error}</span>}
    </Frame>
  )
}

// Sibling of AddFolderButton — creates a file at the project root instead of a
// folder, same inline-input-on-click flow. Sits next to Add Folder in the
// LeftRailing header so file/folder creation share one spot.
function AddFileButton({ onCreated }: { onCreated: () => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setAdding(false)
    setName('')
    setError(null)
  }

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await createWorkspaceFile(trimmed, '')
      reset()
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!adding) {
    return <IconButton onClick={() => setAdding(true)} title="Add new file" icon="file-add" />
  }

  return (
    <Frame flow="horizontal" align="center" gap={4}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') reset()
        }}
        onBlur={() => { if (!name) reset() }}
        placeholder="file name"
        style={{ ...FIELD_STYLE, width: 120 }}
      />
      {error && <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{error}</span>}
    </Frame>
  )
}

// Lets "Open Folder" actually repoint the app at an arbitrary project on
// disk (ROADMAP.md's Phase 0) — a wholly separate, independently-rooted
// scope:'workspace' alongside Components/Prototypes/Docker's scope:'src'|
// 'repo', which stay pinned to Sleipnir's own install. No onAddToPlan (an
// arbitrary external file has no relationship to Sleipnir's own graph). LSP
// attaches either way: to Sleipnir's own shared language server when the
// open folder is (or is inside) Sleipnir's own repo (repoRelativeRoot below),
// or to a second, per-project language server rooted at the open folder
// itself otherwise (workspaceRoot below) — see CodeEditorView.ViewModel's
// lspTargetForScope and lspClient.ts's LspRoot/tools/lsp-proxy.mjs's
// per-connection routing for how the two are told apart.
export const WorkspaceView = forwardRef<FolderBrowserHandle, WorkspaceViewProps>(function WorkspaceView(
  {
    initialFile,
    pendingOverride,
    onOverrideSaved,
    onPlanCreated,
    onPlanUpdated,
    onProjectOpened,
    recentProjects,
    onOpenRecentProject,
    onShowInPlanning,
    onShowInCanvas,
    canvasComponentPaths,
    onPathMoved,
    onPathDeleted,
  },
  ref,
) {
  const { info, loading, error, chooseFolder, cloneAndOpen, cloning } = useWorkspaceViewModel(onProjectOpened)
  const planNodeLinks = usePlanNodeLinks(info?.root)
  const [addingPlan, setAddingPlan] = useState(false)
  const [showClone, setShowClone] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')

  // Live candidate pool for the "##token" editor extension (graphLinkExtension)
  // — a ref, not state, since CodeEditorView reads it synchronously via
  // getGraphNodes() on every completion query rather than re-rendering.
  // Refreshed on open and after every resolved link; good-enough freshness
  // for an interactive single-session flow, same as Planning's own
  // explicit-refresh pattern (no cross-category live sync exists anywhere
  // else in this app either).
  const graphNodesRef = useRef<GraphNode[]>([])
  const refreshGraphNodes = () => {
    getNotes().then(({ nodes }) => { graphNodesRef.current = nodes }).catch(() => {})
  }
  useEffect(() => {
    if (info?.root) refreshGraphNodes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.root])

  // Marks the originating plan-step node done once its staged content is
  // actually saved to disk — same approval-gate semantics the old Component
  // Library override flow used.
  const handleOverrideSaved = (planNodeId: string) => {
    setNodeStatus(planNodeId, 'done').catch(() => {})
    onOverrideSaved?.(planNodeId)
  }

  // Re-scans a just-saved file's real imports and reconciles the
  // corresponding scaffolded node's outgoing 'borrows' edges to match — the
  // "write code, graph updates" direction (see AddNodeModal.ViewModel/
  // PlanningView's node-card link editor for the reverse direction). A no-op
  // for a language with no adapter (none currently — TSX/Python/Rust/Go all
  // have one) or a file with no matching scaffolded node.
  const handleImportsChanged = async (path: string, content: string) => {
    const adapter = adapterForPath(path)
    if (!adapter) return
    const { nodes } = await getNotes()
    const sourceNode = nodes.find((n) => n.filePath === path)
    if (!sourceNode) return
    const candidatePaths = nodes.filter((n): n is typeof n & { filePath: string } => !!n.filePath).map((n) => n.filePath)
    const aliases = await loadPathAliases((p) => readWorkspaceFile(p).then((r) => r.content)).catch(() => undefined)
    const targetIds = new Set<string>()
    for (const spec of adapter.detectImports(content)) {
      const targetPath = adapter.resolveSpecifier(path, spec.raw, candidatePaths, aliases)
      const targetNode = targetPath ? nodes.find((n) => n.filePath === targetPath) : undefined
      if (targetNode) targetIds.add(targetNode.id)
    }
    setNodeBorrows(sourceNode.id, [...targetIds]).catch(() => {})
  }

  // "##token" resolved in the editor — adds one more outgoing link on top
  // of whatever the source node already has (additive, unlike
  // handleImportsChanged's full-replace-from-a-fresh-scan above), since this
  // fires mid-edit, before the file (and therefore its full new import list)
  // has necessarily been saved yet.
  const handleLinkResolved = async (path: string, target: GraphNode) => {
    const { nodes, edges } = await getNotes()
    graphNodesRef.current = nodes
    const sourceNode = nodes.find((n) => n.filePath === path)
    if (!sourceNode) return
    const existingTargets = edges.filter((e) => e.source === sourceNode.id && e.kind === 'borrows').map((e) => e.target)
    const targetIds = new Set([...existingTargets, target.id])
    await setNodeBorrows(sourceNode.id, [...targetIds]).catch(() => {})
  }

  if (loading) return null

  if (!info?.root) {
    return (
      <Frame flow="vertical" grow align="center" justify="center" gap={16}>
        <span style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.06em', ...MONO }}>
          {workspaceAvailable ? 'No folder open' : 'Workspace requires the desktop app'}
        </span>
        {workspaceAvailable && (
          <Button variant="primary" size="md" onClick={chooseFolder}>
            Choose Workspace Folder…
          </Button>
        )}
        {workspaceAvailable && (
          showClone ? (
            <Frame flow="vertical" align="center" gap={8} style={{ width: 340 }}>
              <input
                autoFocus
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cloneUrl.trim()) cloneAndOpen(cloneUrl)
                  if (e.key === 'Escape') setShowClone(false)
                }}
                placeholder="https://github.com/user/repo.git"
                disabled={cloning}
                style={{ ...FIELD_STYLE, width: '100%' }}
              />
              <Frame flow="horizontal" align="center" gap={8}>
                <Button variant="ghost" size="sm" onClick={() => setShowClone(false)} disabled={cloning}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={() => cloneAndOpen(cloneUrl)} disabled={cloning || !cloneUrl.trim()} isLoading={cloning}>
                  {cloning ? 'Cloning…' : 'Clone'}
                </Button>
              </Frame>
              <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>You'll pick a destination folder next.</span>
            </Frame>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setShowClone(true)}>Clone Repository…</Button>
          )
        )}
        {error && <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{error}</span>}
        {workspaceAvailable && recentProjects && recentProjects.length > 0 && (
          <Frame flow="vertical" align="center" gap={4} style={{ marginTop: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', ...MONO }}>
              RECENT PROJECTS
            </span>
            {recentProjects.map((p) => (
              <button
                key={p.path}
                onClick={() => onOpenRecentProject?.(p.path)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-2)',
                  fontSize: 12,
                  padding: '2px 0',
                  ...MONO,
                }}
              >
                {p.name}
              </button>
            ))}
          </Frame>
        )}
      </Frame>
    )
  }

  return (
    <>
      <FolderBrowserView
        // Workspace's root is always "" (same convention OPEN_FILES_ID's
        // scope:'repo' browser uses) — the key forces a full remount on
        // folder switch so the previous folder's open tabs don't leak into
        // the new one (FolderBrowserView.ViewModel's reset effect is keyed on
        // `root`, which never itself changes here).
        key={info.root}
        ref={ref}
        scope="workspace"
        root=""
        rootLabel={info.name ?? undefined}
        repoRelativeRoot={info.repoRelativeRoot}
        workspaceRoot={info.root}
        supportsCreate
        supportsAddNode
        onPlanUpdated={onPlanUpdated}
        initialFile={initialFile}
        pendingOverride={pendingOverride}
        onOverrideSaved={handleOverrideSaved}
        onImportsChanged={handleImportsChanged}
        getGraphNodes={() => graphNodesRef.current}
        onLinkResolved={handleLinkResolved}
        onShowInPlanning={onShowInPlanning}
        onShowInCanvas={onShowInCanvas}
        planNodeLinks={planNodeLinks}
        canvasComponentPaths={canvasComponentPaths}
        onMoved={onPathMoved}
        onPathDeleted={onPathDeleted}
        headerAction={(refresh) => (
          <>
            <IconButton icon="plan-add" title="Add Plan…" onClick={() => setAddingPlan(true)} />
            <AddFolderButton onCreated={refresh} />
            <AddFileButton onCreated={refresh} />
          </>
        )}
      />
      {addingPlan && (
        <NewWorkspacePlanModal
          onClose={() => setAddingPlan(false)}
          onCreated={(plan) => {
            setAddingPlan(false)
            onPlanCreated?.(plan)
          }}
        />
      )}
    </>
  )
})
