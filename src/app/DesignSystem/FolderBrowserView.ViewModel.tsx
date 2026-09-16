import { useEffect, useRef, useState } from 'react'
import {
  listDir,
  listRepoDir,
  listWorkspaceDir,
  readFile,
  readRepoFile,
  readWorkspaceFile,
  getArchivedPaths,
  isArchived,
  getLastVisit,
  setLastVisit,
  type FileTreeNode,
  type ArchiveEntry,
} from '../../00_planning/api/sleipnirApi'
import type { FolderBrowserViewProps, PaneId, PaneState } from './iFolderBrowserView'

// Same recursive archived-subtree filter DesignLibrary.view.tsx/
// FolderWidget.ViewModel.tsx each had their own copy of.
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

function tabLabelFor(path: string): string {
  return path.split('/').pop() ?? path
}

const emptyPane = (): PaneState => ({ tabs: [], activeTabPath: null })

function paneWithPath(panes: Record<PaneId, PaneState>, path: string): PaneId | null {
  if (panes.primary.tabs.some((t) => t.path === path)) return 'primary'
  if (panes.secondary.tabs.some((t) => t.path === path)) return 'secondary'
  return null
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function useFolderBrowserViewModel({ scope, root, extraFiles, readOnly, supportsCreate, initialFile, pendingOverride }: FolderBrowserViewProps) {
  const [rawTree, setRawTree] = useState<FileTreeNode[]>([])
  const [archivedEntries, setArchivedEntries] = useState<ArchiveEntry[]>([])
  const [newPaths, setNewPaths] = useState<Set<string>>(new Set())
  const [panes, setPanes] = useState<Record<PaneId, PaneState>>({ primary: emptyPane(), secondary: emptyPane() })
  const [focusedPane, setFocusedPane] = useState<PaneId>('primary')
  const [contentByPath, setContentByPath] = useState<Record<string, string>>({})
  const requested = useRef<Set<string>>(new Set())

  // The right pane exists purely as a derived fact of its own tab list — no
  // separate "is split" flag to fall out of sync with it. Closing every tab
  // in the secondary pane collapses back to single-pane for free.
  const isSplit = panes.secondary.tabs.length > 0

  const sessionLastVisitRef = useRef(getLastVisit())
  // Files opened this session — dropped from the "new" set so their chip
  // stays gone even after a refresh re-derives newness from createdAt (which
  // wouldn't otherwise know the user has since looked at them). Cleared on
  // root change (a different project starts its own baseline).
  const seenPathsRef = useRef<Set<string>>(new Set())

  const refresh = () => {
    const fetchTree =
      scope === 'repo' ? listRepoDir(root, extraFiles) : scope === 'workspace' ? listWorkspaceDir(root) : listDir(root)
    fetchTree.then(({ tree }) => {
      setRawTree(tree)
      const fresh = new Set<string>()
      collectNewPaths(tree, sessionLastVisitRef.current, fresh)
      for (const p of seenPathsRef.current) fresh.delete(p)
      setNewPaths(fresh)
    }).catch(() => {})
    // No archive support for scope:'workspace' in Phase 0 (see ROADMAP.md) —
    // archive.json is SRC_ROOT-scoped and meaningless for an arbitrary
    // external folder; LeftRailing's supportsArchive prop hides the UI too.
    if (supportsCreate && !readOnly && scope !== 'workspace') {
      getArchivedPaths().then(({ entries }) => setArchivedEntries(entries)).catch(() => {})
    }
  }

  // Re-fetches whenever `root` changes — a browser instance whose root is
  // reassigned (e.g. Components switching which registered library it
  // shows) needs a clean tree, not the old library's.
  useEffect(() => {
    refresh()
    setLastVisit(Date.now())
    setPanes({ primary: emptyPane(), secondary: emptyPane() })
    setFocusedPane('primary')
    requested.current.clear()
    seenPathsRef.current.clear()
    setContentByPath({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root])

  // `line` updates in place even for an already-open tab (not just a no-op)
  // so a second search-result click on a different match inside a tab
  // that's already open still re-reveals the new line — see CodeEditorView's
  // revealLine effect, which is keyed on path+line and re-fires accordingly.
  // A path already open in EITHER pane is never opened a second time — see
  // iFolderBrowserView.tsx's PaneState doc comment for why (the LSP client
  // rejects a second didOpen for the same file) — it's just activated and
  // focused wherever it already lives.
  const openTab = (path: string, label?: string, line?: number) => {
    // Opening a file marks it seen — its NEW chip disappears and doesn't come
    // back on the next refresh (see seenPathsRef in refresh above).
    seenPathsRef.current.add(path)
    setNewPaths((prev) => {
      if (!prev.has(path)) return prev
      const next = new Set(prev)
      next.delete(path)
      return next
    })
    const targetPane = paneWithPath(panes, path) ?? focusedPane
    const pane = panes[targetPane]
    const tabs = pane.tabs.some((t) => t.path === path)
      ? pane.tabs.map((t) => (t.path === path ? { ...t, line } : t))
      : [...pane.tabs, { path, label: label ?? tabLabelFor(path), line }]
    setPanes({ ...panes, [targetPane]: { tabs, activeTabPath: path } })
    setFocusedPane(targetPane)
  }

  // Re-applied whenever `initialFile` changes after mount (not just on the
  // instance's own creation) — this browser stays mounted across NavRail
  // switches, so a later "open this other file here" jump has to reach it.
  useEffect(() => {
    if (initialFile) openTab(initialFile.path, initialFile.name, initialFile.line)
  }, [initialFile])

  // A pendingOverride opens its own tab too (skipping the disk read — see
  // the contentByPath override below) — same "changes after mount" reasoning
  // as initialFile.
  useEffect(() => {
    if (pendingOverride) openTab(pendingOverride.path)
  }, [pendingOverride])

  const closeTab = (pane: PaneId, path: string) => {
    const paneState = panes[pane]
    const remaining = paneState.tabs.filter((t) => t.path !== path)
    const activeTabPath =
      paneState.activeTabPath === path ? remaining[remaining.length - 1]?.path ?? null : paneState.activeTabPath
    setPanes({ ...panes, [pane]: { tabs: remaining, activeTabPath } })
    // The secondary pane emptying out is what collapses the split (isSplit
    // is derived from its tab count) — focus just needs to follow it back.
    if (pane === 'secondary' && remaining.length === 0 && focusedPane === 'secondary') {
      setFocusedPane('primary')
    }
  }

  // Fired after a right-click delete (see LeftRailing's onDeleted) — closes
  // the deleted file's own tab in whichever pane(s) had it open, or every
  // open tab nested under a deleted folder, so nothing's left pointing at a
  // path that no longer exists on disk (the next read of it would just
  // 404/ENOENT).
  const closeTabsUnder = (path: string, isDir: boolean) => {
    const matches = (p: string) => (isDir ? p === path || p.startsWith(`${path}/`) : p === path)
    const next: Record<PaneId, PaneState> = { primary: panes.primary, secondary: panes.secondary }
    let secondaryEmptied = false
    for (const id of ['primary', 'secondary'] as PaneId[]) {
      const paneState = panes[id]
      const remaining = paneState.tabs.filter((t) => !matches(t.path))
      const activeTabPath =
        paneState.activeTabPath && matches(paneState.activeTabPath)
          ? remaining[remaining.length - 1]?.path ?? null
          : paneState.activeTabPath
      next[id] = { tabs: remaining, activeTabPath }
      if (id === 'secondary' && remaining.length === 0) secondaryEmptied = true
    }
    setPanes(next)
    if (secondaryEmptied && focusedPane === 'secondary') setFocusedPane('primary')
  }

  // Activates `path` within `pane` (a tab-strip click) — also moves focus
  // there, since clicking a tab is itself a focus action.
  const activateTab = (pane: PaneId, path: string) => {
    setPanes({ ...panes, [pane]: { ...panes[pane], activeTabPath: path } })
    setFocusedPane(pane)
  }

  // Moves the primary pane's active tab into a new secondary pane — see
  // iFolderBrowserView.tsx's PaneState doc comment for why this MOVES the
  // tab rather than duplicating it into both panes.
  const splitRight = () => {
    const activePath = panes.primary.activeTabPath
    const tab = panes.primary.tabs.find((t) => t.path === activePath)
    if (!tab) return
    const remainingPrimary = panes.primary.tabs.filter((t) => t.path !== tab.path)
    setPanes({
      primary: { tabs: remainingPrimary, activeTabPath: remainingPrimary[remainingPrimary.length - 1]?.path ?? null },
      secondary: { tabs: [...panes.secondary.tabs, tab], activeTabPath: tab.path },
    })
    setFocusedPane('secondary')
  }

  const focusPane = (pane: PaneId) => {
    if (pane !== focusedPane) setFocusedPane(pane)
  }

  // Discards every tab in the secondary pane at once (its header's own close
  // button) — equivalent to closing its tabs one-by-one, which already
  // collapses the split since isSplit is derived from its tab count, just
  // without the intermediate re-renders.
  const closeSecondaryPane = () => {
    setPanes({ ...panes, secondary: emptyPane() })
    if (focusedPane === 'secondary') setFocusedPane('primary')
  }

  // Loads each open tab's content once, lazily — same shape as
  // useFileTabContents, just scope-aware (readFile vs readRepoFile) and
  // living alongside this instance's other tab state instead of a separate
  // hook, since both need the same `requested` de-dupe guard. Covers tabs in
  // both panes — the cache itself is shared, keyed by path only, since the
  // same file's content doesn't differ by which pane displays it.
  useEffect(() => {
    const allTabs = [...panes.primary.tabs, ...panes.secondary.tabs]
    for (const tab of allTabs) {
      if (requested.current.has(tab.path)) continue
      // A matching pendingOverride skips the disk read entirely (not just a
      // display override) — once the human saves and the override clears,
      // this still hasn't been fetched, so it correctly falls through to a
      // fresh read of what was just written rather than stale pre-save
      // content.
      if (pendingOverride && pendingOverride.path === tab.path) continue
      requested.current.add(tab.path)
      const fetchFile =
        scope === 'repo' ? readRepoFile(tab.path) : scope === 'workspace' ? readWorkspaceFile(tab.path) : readFile(tab.path)
      fetchFile
        .then(({ content }) => setContentByPath((prev) => ({ ...prev, [tab.path]: content })))
        .catch((e) => {
          const message = e instanceof Error ? e.message : String(e)
          const text = /ENOENT|no such file|does not exist/i.test(message)
            ? `// File not found: ${tab.path}\n// It may have been moved or deleted outside Sleipnir. Planning's missing-files bar can relink it.`
            : `// Failed to load source: ${message}`
          setContentByPath((prev) => ({ ...prev, [tab.path]: text }))
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panes, pendingOverride])

  const liveTree = supportsCreate ? filterArchived(rawTree, archivedEntries) : rawTree

  // Split-divider drag-resize — same approach as WidgetShell.ViewModel.tsx's
  // startDrag, just one dimension and no target discriminator, so it isn't
  // worth threading a third drag target through the shared hook every other
  // WidgetShell caller (rail/preview only) depends on.
  const [secondaryPaneWidth, setSecondaryPaneWidth] = useState(480)
  const paneDragRef = useRef<{ dragging: boolean; start: number; startSize: number }>({
    dragging: false,
    start: 0,
    startSize: 0,
  })

  const startPaneDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    paneDragRef.current = { dragging: true, start: e.clientX, startSize: secondaryPaneWidth }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!paneDragRef.current.dragging) return
      const { start, startSize } = paneDragRef.current
      // The divider is the secondary pane's LEFT edge; its right edge is
      // fixed to the code area's own right edge, so dragging the divider
      // right shrinks it (mirrors WidgetShell's rail, which grows the other
      // way because its own fixed edge is on the opposite side).
      setSecondaryPaneWidth(clamp(startSize - (e.clientX - start), 280, 900))
    }
    const stopDrag = () => {
      if (!paneDragRef.current.dragging) return
      paneDragRef.current.dragging = false
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

  return {
    liveTree,
    archivedEntries,
    newPaths,
    panes,
    focusedPane,
    isSplit,
    openTab,
    closeTab,
    closeTabsUnder,
    activateTab,
    splitRight,
    focusPane,
    closeSecondaryPane,
    contentByPath,
    refresh,
    secondaryPaneWidth,
    startPaneDrag,
  }
}
