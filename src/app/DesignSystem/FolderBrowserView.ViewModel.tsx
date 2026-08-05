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
import type { BrowserTab, FolderBrowserViewProps } from './iFolderBrowserView'

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

export function useFolderBrowserViewModel({ scope, root, extraFiles, readOnly, supportsCreate, initialFile, pendingOverride }: FolderBrowserViewProps) {
  const [rawTree, setRawTree] = useState<FileTreeNode[]>([])
  const [archivedEntries, setArchivedEntries] = useState<ArchiveEntry[]>([])
  const [newPaths, setNewPaths] = useState<Set<string>>(new Set())
  const [tabs, setTabs] = useState<BrowserTab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [contentByPath, setContentByPath] = useState<Record<string, string>>({})
  const requested = useRef<Set<string>>(new Set())

  const sessionLastVisitRef = useRef(getLastVisit())

  const refresh = () => {
    const fetchTree =
      scope === 'repo' ? listRepoDir(root, extraFiles) : scope === 'workspace' ? listWorkspaceDir(root) : listDir(root)
    fetchTree.then(({ tree }) => {
      setRawTree(tree)
      const fresh = new Set<string>()
      collectNewPaths(tree, sessionLastVisitRef.current, fresh)
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
    setTabs([])
    setActiveTabPath(null)
    requested.current.clear()
    setContentByPath({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root])

  // `line` updates in place even for an already-open tab (not just a no-op)
  // so a second search-result click on a different match inside a tab
  // that's already open still re-reveals the new line — see CodeEditorView's
  // revealLine effect, which is keyed on path+line and re-fires accordingly.
  const openTab = (path: string, label?: string, line?: number) => {
    setTabs((prev) =>
      prev.some((t) => t.path === path)
        ? prev.map((t) => (t.path === path ? { ...t, line } : t))
        : [...prev, { path, label: label ?? tabLabelFor(path), line }],
    )
    setActiveTabPath(path)
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

  const closeTab = (path: string) => {
    const remaining = tabs.filter((t) => t.path !== path)
    setTabs(remaining)
    if (activeTabPath === path) setActiveTabPath(remaining[remaining.length - 1]?.path ?? null)
  }

  // Loads each open tab's content once, lazily — same shape as
  // useFileTabContents, just scope-aware (readFile vs readRepoFile) and
  // living alongside this instance's other tab state instead of a separate
  // hook, since both need the same `requested` de-dupe guard.
  useEffect(() => {
    for (const tab of tabs) {
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
          setContentByPath((prev) => ({ ...prev, [tab.path]: `// Failed to load source: ${message}` }))
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, pendingOverride])

  const liveTree = supportsCreate ? filterArchived(rawTree, archivedEntries) : rawTree

  return {
    liveTree,
    archivedEntries,
    newPaths,
    tabs,
    activeTabPath,
    setActiveTabPath,
    openTab,
    closeTab,
    contentByPath,
    refresh,
  }
}
