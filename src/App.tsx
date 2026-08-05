import { useEffect, useRef, useState } from 'react'
import './02_components/00_themes/default.css'
import './02_components/00_themes/dark.css'
import './02_components/00_themes/houseplant.css'
import './02_components/00_themes/tactical.css'
import { ThemeProvider } from './02_components/00_themes/ThemeProvider'
import { Frame } from './app/UIKit/Frame/Frame'
import { NavRail, type NavRailItem } from './app/NavRail/NavRail'
import { TerminalDock } from './app/TerminalDock/TerminalDock'
import { AgentDock } from './app/AgentDock/AgentDock'
import { ProblemsDock } from './app/ProblemsDock/ProblemsDock'
import { SettingsView } from './app/SettingsView/SettingsView'
import { TitleBar } from './app/TitleBar/TitleBar'
import DesignLibraryView from './app/DesignSystem/DesignLibrary.view'
import { FolderWidgetView } from './app/DesignSystem/FolderWidget.view'
import { FolderBrowserView } from './app/DesignSystem/FolderBrowserView'
import type { FolderBrowserHandle } from './app/DesignSystem/iFolderBrowserView'
import { WorkspaceView } from './app/Workspace/WorkspaceView'
import { CommandPalette } from './app/CommandPalette/CommandPalette'
import { OpenFolderModal } from './00_planning/OpenFolderModal'
import { PlanningView } from './00_planning/PlanningView'
import { WidgetStoreView } from './00_planning/WidgetStore.view'
import { ResearchView } from './01_research/ResearchView'
import SourceControlView from './06_source_control/SourceControlView'
import { LIBRARIES, getGraphMaps, type GraphMapId, type GraphNode, type LibraryEntry, type SavedPlan, type WidgetEntry } from './00_planning/graph/types'
import { getGraphForMap } from './00_planning/graph/combine'
import { toGraphNodeId, expandToNeighbors } from './00_planning/graph/resolvePlan'
import { listWidgets, openFileDialog, openFolderDialog, openFileNode, getPlans, createPlan, deletePlan, getWorkspaceInfo } from './00_planning/api/sleipnirApi'
import { registerLspFileOpener } from './app/DesignSystem/lspClient'
import type { GeneratedFile } from './app/AgentChat/iAgentChat'

export type { Page } from './types'

const DEFAULT_LIBRARY_ID = 'dsm'
// Must match TerminalDock/AgentDock/ProblemsDock's own panel height exactly
// — this is the space reclaimed from the flex column above so the fixed
// panel lands in a genuine gap instead of covering real content.
const DOCK_PANEL_HEIGHT = 320

// Validation and Analytics are hidden for now, not removed — src/05_analytics/
// stays untouched on disk (Validation had no dedicated module, just the local
// PlaceholderView stub below, since deleted along with its only call site).
// Bringing either back is restoring its entry here, its case in
// renderCategory, and — for Validation — a one-line placeholder view.
const NAV_ITEMS: NavRailItem[] = [
  { id: 'planning',    tag: '00',  title: 'Planning',    icon: 'network' },
  { id: 'research',    tag: '01',  title: 'Research',    icon: 'research' },
  { id: 'library',     tag: '02',  title: 'Components',  icon: 'frame' },
  { id: 'workspace',   tag: 'WS',  title: 'Workspace',   icon: 'folder' },
  { id: 'source-control', tag: 'GIT', title: 'Source Control', icon: 'git-branch' },
]

// Fixed rail entry for the widget store — a full page (WidgetStoreView),
// not a popup, so it's just another category like any other.
const ADD_WIDGET_ID = 'add-widget'
const ADD_WIDGET_ITEM: NavRailItem = { id: ADD_WIDGET_ID, tag: '+', title: 'Add Widget', icon: 'plugin' }
// Not in NAV_ITEMS — no rail icon of its own. Files without a library land
// here as a background category, reached only through openFile()'s fallback
// or Planning's "Open in Editor" link on an opened-file node, never by
// direct rail navigation.
const OPEN_FILES_ID = 'open-files'
const OPEN_FILES_LABEL = 'Open Files'

// Component Library's own file-tree path format has no `src/` prefix (e.g.
// "02_components/01_atoms/Frame/Frame.tsx"), unlike a graph node's filePath
// (root-relative, e.g. "src/02_components/01_atoms/Frame/Frame.tsx").
function libraryFileFromNode(node: GraphNode): { name: string; path: string } | null {
  if (!node.filePath) return null
  const path = node.filePath.replace(/^src\//, '')
  const base = path.split('/').pop() ?? path
  const name = base.replace(/\.[^./]+$/, '')
  return { name, path }
}

// generate_code's staged file paths are already component-library-relative
// (no src/ prefix, see electron/chat.cjs's tool schema) — same format
// libraryFileFromNode produces from a GraphNode's filePath.
function libraryFileFromPath(path: string): { name: string; path: string } {
  const base = path.split('/').pop() ?? path
  const name = base.replace(/\.[^./]+$/, '')
  return { name, path }
}

function libraryIdForPath(path: string): string | undefined {
  return LIBRARIES.find((lib) => path.startsWith(`${lib.root}/`))?.id
}

// Repo-root-relative counterpart to libraryIdForPath, for File > Open
// File's arbitrary repo-relative paths (which carry the `src/` prefix
// libraryIdForPath's convention above doesn't).
function libraryForRepoPath(path: string): LibraryEntry | undefined {
  return LIBRARIES.find((lib) => path.startsWith(`src/${lib.root}/`))
}

function tabLabelFor(path: string): string {
  return path.split('/').pop() ?? path
}

// Only files with no graph presence anywhere get an opened-file node (see
// tools/sleipnir-backend.mjs#openFileNode) — the graph itself is only
// assembled here in the renderer (combine.ts uses Vite's import.meta.glob),
// so this check can't live in the Node backend. A handful of small,
// in-memory JSON scans triggered once per Open File action, not a hot path.
function findExistingNodeForPath(path: string): GraphNode | undefined {
  for (const map of getGraphMaps()) {
    const node = getGraphForMap(map.id).nodes.find((n) => n.filePath === path)
    if (node) return node
  }
  return undefined
}

function App() {
  // NavRail switches between mutually-exclusive categories (never a shared
  // cross-category tab strip — see FolderBrowserView for where tabs
  // actually live, scoped inside a single category). `mountedCategories`
  // only grows: a category, once visited, stays mounted-but-hidden so its
  // state (open tabs, scroll position, ...) survives switching away and
  // back, without ever showing two categories' content side by side.
  const [activeCategory, setActiveCategory] = useState('planning')
  const [mountedCategories, setMountedCategories] = useState<string[]>(['planning'])
  const [widgets, setWidgets] = useState<WidgetEntry[]>([])
  // Saved plans (see graph/types.ts's SavedPlan doc comment) — fetched once
  // and appended to locally on create, same "runtime, not statically
  // imported" pattern as `widgets` just above (a plan has no build-time
  // JSON to statically import from, unlike LIBRARIES). Passed down into
  // PlanningView as a prop rather than fetched there, so a plan created from
  // any widget shows up immediately without Planning needing its own
  // independent re-fetch.
  const [plans, setPlans] = useState<SavedPlan[]>([])
  // Set right before switching categories, then consumed reactively by the
  // target category's own FolderBrowserView instance (see its initialFile/
  // pendingOverride doc comments) — works whether that instance is mounting
  // for the first time or was already sitting there from an earlier visit.
  const [pendingLibraryFile, setPendingLibraryFile] = useState<{ name: string; path: string; line?: number } | null>(null)
  const [pendingComponentLibraryId, setPendingComponentLibraryId] = useState<string | undefined>(undefined)
  const [pendingOpenFile, setPendingOpenFile] = useState<{ name: string; path: string; line?: number } | null>(null)
  // Same "consumed reactively by the target category's own FolderBrowserView
  // instance" shape as pendingLibraryFile/pendingOpenFile above, for the
  // Workspace category — only ever set by jumpToProjectFile below (search/
  // quick-open results), never by File > Open (which stays repo-only
  // regardless of whether a Workspace happens to be open, see jumpToProjectFile's
  // own comment for why that distinction matters).
  const [pendingWorkspaceFile, setPendingWorkspaceFile] = useState<{ name: string; path: string; line?: number } | null>(null)
  // Staged AI-generated content for an approved plan node (see PlanningView's
  // "Generate Code" -> electron/chat.cjs's generate_code tool) — V1 stages
  // one file at a time even though the tool can return several, so only the
  // first is opened for review.
  const [pendingOverride, setPendingOverride] = useState<{ path: string; content: string; planNodeId: string } | null>(null)
  const [focusMapId, setFocusMapId] = useState<GraphMapId | null>(null)
  // A nonce, not a boolean — a second `/plan` while Planning is already
  // mounted still needs to re-trigger the effect that opens the modal.
  const [createLibraryRequestId, setCreateLibraryRequestId] = useState(0)
  // Terminal, AI Chat, and Problems share one full-width bottom dock slot —
  // only one can be open at a time, or their panels would fully overlap.
  // Settings is a full page (see 'settings' in renderCategory), not part of
  // this family.
  const [activeDock, setActiveDock] = useState<'terminal' | 'agent' | 'problems' | null>(null)
  // Set by the File menu's Open Folder… flow once a directory is picked —
  // renders OpenFolderModal to confirm/install it as a widget (see below).
  const [pendingFolderPath, setPendingFolderPath] = useState<string | null>(null)
  // Every FolderBrowserView-backed category's imperative handle, keyed by
  // category id — lets the File menu's Save/Save All (which live in
  // TitleBar, outside any category's own tree) reach whichever category is
  // currently active.
  const browserRefs = useRef<Map<string, FolderBrowserHandle | null>>(new Map())
  const setBrowserRef = (id: string, handle: FolderBrowserHandle | null) => {
    if (handle) browserRefs.current.set(id, handle)
    else browserRefs.current.delete(id)
  }

  // Registered NavRail widgets (Docker today). Always fetched at runtime, not
  // statically imported like LIBRARIES — see the comment on WidgetEntry in
  // graph/types.ts for why that distinction matters in a packaged build.
  useEffect(() => {
    listWidgets().then(({ widgets }) => setWidgets(widgets)).catch(() => {})
  }, [])

  useEffect(() => {
    getPlans().then(({ plans }) => setPlans(plans)).catch(() => {})
  }, [])

  // Lets lspClient.ts's SleipnirWorkspace (a plain, non-React module) reach
  // App.tsx's openFile() routing for cross-file go-to-definition/find-
  // references/rename jumps (ROADMAP.md's Phase 1) — see its own doc
  // comment. Registered once: openFile()'s actual behavior only ever closes
  // over stable setState setters/imports, so there's no stale-closure risk
  // in skipping it from the deps list.
  useEffect(() => {
    registerLspFileOpener((path) => openFile(path, { skipNodeCheck: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Just updates the installed list — WidgetStoreView stays open (like
  // installing a VS Code extension keeps you on the Extensions view); the
  // user opens the widget themselves via its new rail icon or the store's
  // "Open Widget" button.
  const onWidgetInstalled = (widget: WidgetEntry) => {
    setWidgets((prev) => [...prev, widget])
  }

  const onDeletePlan = (id: string) => {
    deletePlan(id).catch(() => {})
    setPlans((prev) => prev.filter((p) => p.id !== id))
  }

  const switchTo = (id: string) => {
    setMountedCategories((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setActiveCategory(id)
  }

  const jumpToComponent = (node: GraphNode) => {
    const file = libraryFileFromNode(node)
    if (!file) return
    setPendingLibraryFile(file)
    setPendingComponentLibraryId(node.map)
    switchTo('library')
  }

  // Fired every time the AI chat streams in a new plan node — brings the
  // user to Planning's CLAUDE tab so they watch it build live instead of
  // staying wherever they last navigated (e.g. the Component Library).
  const jumpToClaudeTab = () => {
    switchTo('planning')
    setFocusMapId('claude')
  }

  // The AI chat's `/plan` slash command — brings the user to Planning (where
  // the Create Library modal lives) and requests it open, same as clicking
  // Planning's own "+ New Library" button.
  const openCreateLibraryFromChat = () => {
    switchTo('planning')
    setCreateLibraryRequestId((n) => n + 1)
  }

  // Fired when the AI creates a library via natural language (the
  // create_library tool, not the `/plan` command) — it already exists on
  // disk by the time this fires, so just jump to it like any other library
  // switch (focusMapId, same mechanism the CLAUDE-tab jump uses).
  const jumpToCreatedLibrary = (library: LibraryEntry) => {
    switchTo('planning')
    setFocusMapId(library.id)
  }

  // Fired once the generate_code tool stages content for an approved plan
  // node (see PlanningView's headless "Generate Code" request) — opens the
  // Code Editor on the staged (unsaved) content, same navigation
  // jumpToComponent uses, plus the override that makes the editor show AI
  // content instead of reading the file from disk.
  const onCodeGenerated = (planNodeId: string, files: GeneratedFile[]) => {
    const first = files[0]
    if (!first) return
    const file = libraryFileFromPath(first.path)
    setPendingOverride({ path: first.path, content: first.content, planNodeId })
    setPendingLibraryFile(file)
    setPendingComponentLibraryId(libraryIdForPath(first.path) ?? DEFAULT_LIBRARY_ID)
    switchTo('library')
  }

  // Adds/selects a file — the one path every "open a file" entry point
  // (File menu, Planning's "Open in Editor" link, LSP go-to-definition/find-
  // references/rename jumps — see lspClient.ts's registerLspFileOpener)
  // funnels through. Routes to whichever registered library's category owns
  // the path, or the Open Files category as a fallback for anything unowned
  // (package.json, README.md, ...). `skipNodeCheck` is for the Planning link
  // and LSP jumps: in both cases the node already exists or is irrelevant, so
  // re-checking/re-creating it would be redundant (or, for incidental
  // "browse to a definition" clicks, would clutter the Planning graph with an
  // `open`-node per file visited).
  const openFile = (path: string, opts?: { skipNodeCheck?: boolean; line?: number }) => {
    const owningLib = libraryForRepoPath(path)
    if (owningLib?.kind === 'component') {
      setPendingLibraryFile({ name: tabLabelFor(path), path: path.replace(/^src\//, ''), line: opts?.line })
      setPendingComponentLibraryId(owningLib.id)
      switchTo('library')
    } else {
      setPendingOpenFile({ name: tabLabelFor(path), path, line: opts?.line })
      switchTo(OPEN_FILES_ID)
    }
    if (!opts?.skipNodeCheck && !findExistingNodeForPath(path)) {
      openFileNode(path).catch(() => {})
    }
  }

  // Project-wide search and quick-open's (ROADMAP.md's Phase 1) shared jump
  // target: "current project" = the open Workspace root if any, else
  // Sleipnir's own repo. Deliberately NOT folded into openFile() itself —
  // File > Open's contract (always repo-relative, restricted to inside the
  // repo by the native dialog) must stay that way regardless of whether a
  // Workspace happens to be open, so this only ever calls openFile() for the
  // repo case and handles the workspace case separately.
  const jumpToProjectFile = async (path: string, opts?: { line?: number; scope?: 'workspace' | 'repo' }) => {
    const scope = opts?.scope ?? ((await getWorkspaceInfo()).root ? 'workspace' : 'repo')
    if (scope === 'workspace') {
      setPendingWorkspaceFile({ name: tabLabelFor(path), path, line: opts?.line })
      switchTo('workspace')
    } else {
      openFile(path, { skipNodeCheck: true, line: opts?.line })
    }
  }

  const onJumpToOpenFile = (node: GraphNode) => {
    if (!node.filePath) return
    openFile(node.filePath, { skipNodeCheck: true })
  }

  // The widget file trees' "add to plan" hover action (see LeftRailingView's
  // onAddToPlan doc comment) — resolves each hovered path to a real graph
  // node id (creating an `open`-map node on the fly for paths with no graph
  // presence at all, e.g. a Docker widget file — same lazy-creation
  // findExistingNodeForPath/openFileNode pair openFile()'s fallback above
  // already uses), expands to direct neighbors client-side, persists the
  // result, and jumps to Planning with it open as a tab — mirrors
  // jumpToCreatedLibrary below.
  const onAddToPlan = async (label: string, paths: string[]) => {
    const seedIds: string[] = []
    for (const path of paths) {
      const id = toGraphNodeId(path)
      const existsInRealMap = getGraphMaps().some((m) => getGraphForMap(m.id).nodes.some((n) => n.id === id))
      if (existsInRealMap) {
        seedIds.push(id)
        continue
      }
      const existing = findExistingNodeForPath(path)
      if (existing) {
        seedIds.push(existing.id)
        continue
      }
      const created = await openFileNode(path).catch(() => null)
      if (created) seedIds.push(created.node.id)
    }
    if (seedIds.length === 0) return
    const nodeIds = expandToNeighbors(seedIds)
    const { plan } = await createPlan(label, nodeIds)
    setPlans((prev) => [...prev, plan])
    switchTo('planning')
    setFocusMapId(plan.id)
  }

  // Both native pickers restrict to (and default inside) the repo — see
  // electron/main.cjs's openFileDialog/openFolderDialog handlers — so
  // `{ error }` here only ever means the user deliberately navigated
  // outside it after being dropped inside.
  const onOpenFileFromMenu = async () => {
    const result = await openFileDialog()
    if (!result) return
    if ('error' in result) { window.alert(result.error); return }
    openFile(result.path)
  }

  const onOpenFolderFromMenu = async () => {
    const result = await openFolderDialog()
    if (!result) return
    if ('error' in result) { window.alert(result.error); return }
    setPendingFolderPath(result.path)
  }

  const onSave = async () => {
    await browserRefs.current.get(activeCategory)?.save()
  }

  const onSaveAll = async () => {
    await browserRefs.current.get(activeCategory)?.saveAll()
  }

  const navItems: NavRailItem[] = [
    ...NAV_ITEMS,
    ...widgets.map((w): NavRailItem => ({ id: w.id, tag: w.tag, title: w.label, icon: w.icon })),
    ADD_WIDGET_ITEM,
  ]

  const categoryLabel = (id: string): string =>
    navItems.find((n) => n.id === id)?.title ?? (id === OPEN_FILES_ID ? OPEN_FILES_LABEL : id)

  // ProblemsDock row click: land on the owning category, then that
  // category's own FolderBrowserView instance activates the specific tab —
  // it's already mounted (ProblemsDock only ever lists tabs from instances
  // that are already tracked in browserRefs), so the ref is there to reach
  // immediately, no need to wait for a remount.
  const onJumpToProblem = (categoryId: string, path: string) => {
    switchTo(categoryId)
    browserRefs.current.get(categoryId)?.focusTab(path)
  }
  // Native pickers are Electron-only (see electronApi.ts's ElectronBridge
  // comment) — undefined here (not just a no-op) so TitleBar disables
  // rather than silently no-ops the menu item in a plain browser dev tab.
  const electronDialogsAvailable = typeof window.electronAPI?.openFileDialog === 'function'

  const renderCategory = (id: string) => {
    switch (id) {
      case 'planning':
        return (
          <PlanningView
            onJumpToComponent={jumpToComponent}
            onJumpToOpenFile={onJumpToOpenFile}
            focusMapId={focusMapId}
            onFocusMapIdConsumed={() => setFocusMapId(null)}
            createLibraryRequestId={createLibraryRequestId}
            onCreateLibraryRequestConsumed={() => setCreateLibraryRequestId(0)}
            onCodeGenerated={onCodeGenerated}
            plans={plans}
            onDeletePlan={onDeletePlan}
          />
        )
      case 'research':
        return <ResearchView />
      case 'workspace':
        return <WorkspaceView ref={(h) => setBrowserRef('workspace', h)} initialFile={pendingWorkspaceFile} />
      case 'source-control':
        return <SourceControlView />
      case 'settings':
        return <SettingsView />
      case ADD_WIDGET_ID:
        return <WidgetStoreView installedWidgets={widgets} onInstalled={onWidgetInstalled} onOpenWidget={switchTo} />
      case 'library':
        return (
          <DesignLibraryView
            ref={(h) => setBrowserRef('library', h)}
            libraryId={pendingComponentLibraryId}
            initialFile={pendingLibraryFile}
            pendingOverride={pendingOverride}
            onOverrideSaved={() => setPendingOverride(null)}
            onAddToPlan={onAddToPlan}
          />
        )
      case OPEN_FILES_ID:
        return (
          <FolderBrowserView
            ref={(h) => setBrowserRef(OPEN_FILES_ID, h)}
            scope="repo"
            root=""
            initialFile={pendingOpenFile}
            onAddToPlan={onAddToPlan}
          />
        )
      default: {
        const widget = widgets.find((w) => w.id === id)
        return widget ? <FolderWidgetView ref={(h) => setBrowserRef(id, h)} entry={widget} onAddToPlan={onAddToPlan} /> : null
      }
    }
  }

  return (
    <ThemeProvider theme="default">
      <Frame
        h="screen"
        flow="vertical"
        fill={{ solid: 'bg-1' }}
        textColor="var(--text-1)"
        clipContent
      >
        <TitleBar
          onSave={onSave}
          onSaveAll={onSaveAll}
          onOpenFile={electronDialogsAvailable ? onOpenFileFromMenu : undefined}
          onOpenFolder={electronDialogsAvailable ? onOpenFolderFromMenu : undefined}
        />

        <Frame flow="horizontal" grow minH={0} clipContent>
          <NavRail
            items={navItems}
            activeId={activeCategory}
            onSelect={switchTo}
            bottomAction={{
              title: 'Settings',
              icon: 'settings',
              active: activeCategory === 'settings',
              onClick: () => switchTo('settings'),
            }}
          />

          <Frame flow="vertical" grow minW={0} clipContent fill={{ solid: 'bg-1' }} style={{ position: 'relative' }}>
            {mountedCategories.map((id) => (
              <div
                key={id}
                style={{ position: 'absolute', inset: 0, display: id === activeCategory ? 'flex' : 'none', flexDirection: 'column' }}
              >
                {renderCategory(id)}
              </div>
            ))}
          </Frame>
        </Frame>

        {/* Reclaims DOCK_PANEL_HEIGHT from the flex column above (NavRail +
            category content, both `grow`) whenever a dock is open — the
            fixed-position panel below then lands exactly in this now-empty
            strip instead of covering the app's real content (the NavRail's
            Settings gear included). */}
        {activeDock && <Frame h={DOCK_PANEL_HEIGHT} shrink={0} />}
      </Frame>
      <TerminalDock
        open={activeDock === 'terminal'}
        onOpenChange={(o) => setActiveDock(o ? 'terminal' : null)}
        shiftUp={activeDock !== null}
      />
      <AgentDock
        open={activeDock === 'agent'}
        onOpenChange={(o) => setActiveDock(o ? 'agent' : null)}
        onPlanNodeCreated={jumpToClaudeTab}
        onPlanCommand={openCreateLibraryFromChat}
        onLibraryCreated={jumpToCreatedLibrary}
        shiftUp={activeDock !== null}
      />
      <ProblemsDock
        open={activeDock === 'problems'}
        onOpenChange={(o) => setActiveDock(o ? 'problems' : null)}
        browserRefs={browserRefs}
        categoryLabel={categoryLabel}
        onJump={onJumpToProblem}
        shiftUp={activeDock !== null}
      />
      <CommandPalette onJumpToFile={jumpToProjectFile} />
      {pendingFolderPath && (
        <OpenFolderModal
          path={pendingFolderPath}
          onClose={() => setPendingFolderPath(null)}
          onInstalled={(widget) => {
            onWidgetInstalled(widget)
            setPendingFolderPath(null)
          }}
        />
      )}
    </ThemeProvider>
  )
}

export default App
