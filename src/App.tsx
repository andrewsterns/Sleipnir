import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import './00_themes/default.css'
import './00_themes/dark.css'
import './00_themes/houseplant.css'
import './00_themes/tactical.css'
import './00_themes/light.css'
import './00_themes/item-states.css'
import { ThemeProvider } from './00_themes/ThemeProvider'
import { ThemeController, useAppTheme } from './00_themes/ThemeController'
import { KeybindingsController } from './00_keybindings/KeybindingsController'
import { Frame } from './app/UIKit/Frame/Frame'
import { NavRail, type NavRailItem } from './app/NavRail/NavRail'
import { TerminalDock } from './app/TerminalDock/TerminalDock'
import { UpgradePrompt } from './app/License/UpgradePrompt'
import { AgentDock } from './app/AgentDock/AgentDock'
import { ProblemsDock } from './app/ProblemsDock/ProblemsDock'
import { RunDock } from './app/RunDock/RunDock'
import { RunControl } from './app/Run/RunControl'
import { useRunner } from './app/Run/useRunner'
import { StatusBar, type DockId } from './app/StatusBar/StatusBar'
import type { ProblemsSummary } from './app/ProblemsDock/ProblemsDock'
import { TitleBar } from './app/TitleBar/TitleBar'
import { CommandPalette } from './app/CommandPalette/CommandPalette'
import { PlanningView } from './00_planning/PlanningView'
import { CanvasView, SettingsView, SourceControlView, ValidationView, WorkspaceView } from './app/lazyViews'
import { bootSignal } from './boot'
import type { GraphMapId, SavedPlan } from './00_planning/graph/types'
import {
  getPlans,
  deletePlan,
  getWorkspaceInfo,
  openWorkspace,
  saveScratchToFolder,
  saveProjectAs,
  getRecentProjects,
  openRecentProject,
  clearRecentProjects,
  newWindow,
  appendPlanGeneratedFiles,
  relinkPlanningPath,
} from './00_planning/api/sleipnirApi'
import type { RecentProject, WorkspaceInfo } from './00_planning/api/PlatformAPI'
import { isPlanningWatchAvailable } from './00_planning/api/iPlanningWatch'
import { usePlanningHealth } from './00_planning/usePlanningHealth'
import { useStatusReconciler } from './00_planning/useStatusReconciler'
import type { MissingPlanningRef } from './00_planning/api/PlatformAPI'
import { useCanvasComponentPaths } from './01_canvas/useCanvasComponentPaths'
import { reconcileDelete, reconcileMove } from './01_canvas/model/store'
import type { FolderBrowserHandle } from './app/DesignSystem/iFolderBrowserView'
import type { GeneratedFile } from './app/AgentChat/iAgentChat'
import { registerLspFileOpener } from './app/DesignSystem/lspFileOpener'
import { DOCK_PANEL_HEIGHT } from './app/shellLayout'
import { flushPendingWrites } from './app/pendingWrites'
import { isTerminalToggle, TERMINAL_TOGGLE_DEFAULT_KEY, TERMINAL_TOGGLE_ID } from './app/shortcuts'
import { useKeybindings } from './00_keybindings/KeybindingsController'

export type { Page } from './types'

// Terminal, AI Chat, and Problems share one full-width bottom dock slot — only
// one can be open at a time, or their panels would fully overlap. The height
// they reserve, and where they sit in the stacking order, now live in
// app/shellLayout.ts: the panel only lands in a genuine gap (rather than on top
// of real content) while its height and the strip reclaimed for it agree, and
// four copies of the number had no way to stay agreed.

// Analytics is still hidden for now, not removed — src/05_analytics/ stays
// untouched on disk. Bringing it back is restoring its entry here and its
// case in renderCategory. (Validation was restored the same way — see the
// 'validation' entry below and its case in renderCategory.)
const NAV_ITEMS: NavRailItem[] = [
  { id: 'planning',    tag: '00',  title: 'Planning',    icon: 'network' },
  { id: 'canvas',      tag: '01',  title: 'Canvas',      icon: 'canvas' },
  { id: 'workspace',   tag: 'WS',  title: 'Workspace',   icon: 'folder' },
  { id: 'validation',  tag: '04',  title: 'Validation',  icon: 'check' },
  { id: 'source-control', tag: 'GIT', title: 'Source Control', icon: 'git-branch' },
]

// The boot screen stays up until the restored project's info and plans are in
// (or there's no project to load), so the first frame isn't an empty board.
const projectLoaded = bootSignal()

function tabLabelFor(path: string): string {
  return path.split('/').pop() ?? path
}

function App() {
  const { theme } = useAppTheme()
  const { bindings } = useKeybindings()
  // NavRail switches between mutually-exclusive categories (never a shared
  // cross-category tab strip — see FolderBrowserView for where tabs
  // actually live, scoped inside a single category). `mountedCategories`
  // only grows: a category, once visited, stays mounted-but-hidden so its
  // state (open tabs, scroll position, ...) survives switching away and
  // back, without ever showing two categories' content side by side.
  const [activeCategory, setActiveCategory] = useState('planning')
  // Set by the title bar's PRO / Upgrade badge to open Settings on its License section.
  const [settingsRequest, setSettingsRequest] = useState<{ id: string } | null>(null)
  // Ctrl/Cmd-clicking a NavRail item opens it in a second, side-by-side pane
  // instead of replacing the primary one (see switchTo) — null means no
  // split is open, in which case the primary pane fills the whole width.
  const [secondaryCategory, setSecondaryCategory] = useState<string | null>(null)
  const [mountedCategories, setMountedCategories] = useState<string[]>(['planning'])
  // Bumped on every in-app save (see onSave/onSaveAll) so Source Control —
  // which stays mounted-but-hidden like every other category and therefore
  // never remounts on a plain category switch — re-reads `git status` the
  // instant a file is written, instead of showing stale state until focus
  // changes. Passed to SourceControlView as `refreshToken`.
  const [gitRefreshToken, setGitRefreshToken] = useState(0)
  // Saved plans (see graph/types.ts's SavedPlan doc comment) — fetched once
  // and appended to locally on create, same "runtime, not statically
  // imported" pattern used elsewhere for state with no build-time JSON to
  // import from. Passed down into PlanningView as a prop rather than fetched
  // there, so a plan created from anywhere shows up immediately without
  // Planning needing its own independent re-fetch.
  const [plans, setPlans] = useState<SavedPlan[]>([])
  // Set right before switching to Workspace, then consumed reactively by
  // WorkspaceView's own FolderBrowserView instance — works whether that
  // instance is mounting for the first time or was already sitting there
  // from an earlier visit.
  const [pendingWorkspaceFile, setPendingWorkspaceFile] = useState<{ name: string; path: string; line?: number } | null>(null)
  // Same reactive-payload pattern as pendingWorkspaceFile, for jumping into
  // Canvas: set right before switchTo('canvas'), consumed by CanvasView to
  // open whichever board owns the component at this filePath and select it.
  const [pendingCanvasFocus, setPendingCanvasFocus] = useState<{ filePath: string } | null>(null)
  // Staged AI-generated content for an approved plan node (see PlanningView's
  // "Generate Code" -> electron/chat.cjs's generate_code tool) — V1 stages
  // one file at a time even though the tool can return several, so only the
  // first is opened for review.
  const [pendingOverride, setPendingOverride] = useState<{ path: string; content: string; planNodeId: string } | null>(null)
  // Cross-section "jump to this node" target for Planning — set right before
  // switchTo('planning'), consumed once by PlanningView to switch to the
  // right map/plan tab and, when nodeId is present, select + center that
  // node too (nodeId is optional so this still covers the plain "jump to
  // this map/tab" case, e.g. jumpToAiTab below).
  const [focusTarget, setFocusTarget] = useState<{ mapId: GraphMapId; nodeId?: string } | null>(null)
  // The currently open project (see ROADMAP.md's Phase 0 "Workspace" +
  // File > Open Project/Open Recent/New Window) — null in the blank state.
  // Single source of truth for the TitleBar's project label, Planning's
  // per-project board (see the `key` on PlanningView below), and Open
  // Recent's list; WorkspaceView keeps its own info in sync both ways (see
  // its onProjectOpened prop for the "changed via its own button" direction).
  const [activeProject, setActiveProject] = useState<{ path: string; name: string } | null>(null)
  // Every filePath with a written canvas component, across every board —
  // fetched once here and handed to PlanningView/WorkspaceView as a prop
  // (same "one fetch, many consumers" reasoning as `plans`), so cross-section
  // "Show in Canvas" menu items know when to appear without either of those
  // features importing from 01_canvas directly.
  const canvasComponentPaths = useCanvasComponentPaths(activeProject?.path)
  // True when the active project is the auto-provided scratch project (no real
  // folder chosen yet) — drives the TitleBar's "unsaved" label + Save action.
  const [isScratch, setIsScratch] = useState(false)
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  // Terminal, AI Chat, Problems and Run share one full-width bottom dock slot —
  // only one can be open at a time, or their panels would fully overlap. Their
  // toggles are the status bar's tabs. Settings is a full page (see 'settings'
  // in renderCategory), not part of this family.
  const [activeDock, setActiveDock] = useState<DockId | null>(null)
  const toggleDock = useCallback((id: DockId) => setActiveDock((cur) => (cur === id ? null : id)), [])
  // ProblemsDock polls the open editors; the status bar shows what it found.
  const [problemsSummary, setProblemsSummary] = useState<ProblemsSummary>({ total: 0, text: null, color: null, rest: 0 })
  // The Play button's runner — one instance, read by both the status bar's
  // Run control and the Run dock.
  const run = useRunner(activeProject?.path)

  // Ctrl+` toggles the terminal, as it does in VS Code (see app/shortcuts.ts for
  // the rule, and 00_keybindings for why it is not registered through Frame's
  // onHotkey like the palette is). Bound on the CAPTURE phase because the
  // terminal is the most likely place to press it from, and xterm handles keys
  // on its own element — it would otherwise swallow the combo that closes it.
  const terminalToggleKey = bindings[TERMINAL_TOGGLE_ID] ?? TERMINAL_TOGGLE_DEFAULT_KEY
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isTerminalToggle(e, terminalToggleKey)) return
      e.preventDefault()
      setActiveDock((cur) => (cur === 'terminal' ? null : 'terminal'))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [terminalToggleKey])
  // Every FolderBrowserView-backed category's imperative handle, keyed by
  // category id — lets the File menu's Save/Save All (which live in
  // TitleBar, outside any category's own tree) reach whichever category is
  // currently active.
  const browserRefs = useRef<Map<string, FolderBrowserHandle | null>>(new Map())
  const setBrowserRef = (id: string, handle: FolderBrowserHandle | null) => {
    if (handle) browserRefs.current.set(id, handle)
    else browserRefs.current.delete(id)
  }

  /**
   * Refetches the Workspace tab's file tree.
   *
   * That tree reloads on mount, on project change, and after its own create/
   * delete actions — nothing else. So a file written from another part of the
   * app (Canvas promoting a component, Planning scaffolding a node's files)
   * lands on disk and stays invisible until the project is switched and
   * switched back, which reads as "it didn't save". Every out-of-tree writer
   * calls this afterwards.
   */
  const refreshWorkspaceTree = () => {
    browserRefs.current.get('workspace')?.refresh()
  }

  /**
   * Reattaches Canvas boards to a file the Workspace tree just moved.
   *
   * Moving a component's file out of `.canvas` into real source is how a staged
   * component becomes a workspace component — the move IS the promotion — so
   * the board has to follow it. Without this the board would keep pointing at
   * the path the file left, and the next push would rewrite an abandoned copy
   * (see 01_canvas/model/relink.ts).
   *
   * Runs for every move, not just ones out of `.canvas`: reconcileMove is a
   * no-op for boards that own nothing at the source path, and a component that
   * was already promoted still needs to be followed if it moves again.
   */
  const handlePathMoved = async (from: string, to: string) => {
    try {
      await reconcileMove(from, to)
    } catch {
      // Best-effort: the bytes have already moved, and a board left stale is a
      // recoverable annoyance, not a reason to surface an error over a
      // successful drag.
    }
    // A move made here is certain, so `.planning/` paths follow it without
    // asking — unlike moves made in another editor, which go through
    // Planning's missing-files bar (see usePlanningHealth).
    try {
      await relinkPlanningPath(from, to)
    } catch {
      // Best-effort for the same reason as above.
    }
  }

  /**
   * Reconciles Canvas boards to a file deleted in the Workspace tree.
   *
   * Deleting a component's file from the tree is the same intent as the
   * Canvas's own REMOVE FROM WORKSPACE, so it gets the same outcome: the
   * component is un-promoted back to a frame when nothing would be lost, and
   * kept but flagged when it carries variants, props, or several instances
   * (see 01_canvas/model/relink.ts's reconcileDeletedPath).
   */
  const handlePathDeleted = async (path: string) => {
    try {
      await reconcileDelete(path)
    } catch {
      // Best-effort, same as handlePathMoved: the file is already gone, and a
      // board left stale is recoverable in a way a failed delete is not.
    }
  }

  const refreshRecentProjects = () => {
    getRecentProjects()?.then((res) => res && setRecentProjects(res.projects)).catch(() => {})
  }

  useEffect(() => {
    getWorkspaceInfo()
      .then((info) => {
        setActiveProject(info.root ? { path: info.root, name: info.name ?? tabLabelFor(info.root) } : null)
        setIsScratch(!!info.isScratch)
        if (!info.root) projectLoaded()
      })
      .catch(projectLoaded)
    refreshRecentProjects()
  }, [])

  // Ref, not a dep — the listener below is registered once, but needs to
  // read whatever pendingOverride is current at close time, which can be
  // long after this effect first ran.
  const pendingOverrideRef = useRef(pendingOverride)
  pendingOverrideRef.current = pendingOverride

  // Save-on-close: answers electron/main.cjs's handleCloseAttempt, which
  // blocks the actual window close until this responds. pendingOverride is
  // the one place staged-but-unsaved AI content lives (see its own doc
  // comment above) — this is desktop-only (window.electronAPI undefined in
  // browser/web-transport mode, where there's no native close to intercept).
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onBeforeClose) return
    const unsubBeforeClose = api.onBeforeClose(async () => {
      // Debounced Canvas/editor autosaves first, so main's unsaved-project
      // check (which runs right after this answer) sees the latest edits on
      // disk, and a real project doesn't lose an edit made a moment ago.
      await flushPendingWrites()
      api.respondBeforeClose?.(pendingOverrideRef.current !== null)
    })
    const unsubSaveBeforeClose = api.onSaveBeforeClose?.(async () => {
      await browserRefs.current.get('workspace')?.saveAll()
      await api.saveBeforeCloseDone?.()
    })
    return () => {
      unsubBeforeClose()
      unsubSaveBeforeClose?.()
    }
  }, [])

  // Refetches Planning's board (Notes/Plans/Archive) whenever the active
  // project changes — PlanningView itself remounts too (see its `key`
  // below), this just keeps this shared `plans` state (also read by
  // onCreatePlan/onDeletePlan) in sync with whichever project is now open.
  useEffect(() => {
    if (!activeProject) {
      setPlans([])
      return
    }
    getPlans()
      .then(({ plans }) => setPlans(plans))
      .catch(() => {})
      .finally(projectLoaded)
  }, [activeProject?.path])

  // Unlike `notes`/`stages` (kept live inside PlanningView.ViewModel.tsx's
  // own planningWatchAPI subscription), `plans` lives up here — so an
  // externally-created plan (a terminal AI running tools/sleipnir-plan.mjs's
  // create-plan, same as the tested `planner-test` flow) needs its own
  // refetch here, or a brand-new plan tab would only ever appear after
  // reopening the project. `stagesOnly` batches never add/remove a plan, so
  // skip them same as PlanningView.ViewModel.tsx does.
  useEffect(() => {
    if (!isPlanningWatchAvailable() || !activeProject) return
    return window.planningWatchAPI!.onChanged((info) => {
      if (info?.stagesOnly || info?.canvasOnly) return
      getPlans().then(({ plans }) => setPlans(plans)).catch(() => {})
    })
  }, [activeProject?.path])

  // Transient, project-scoped UI state (staged files/overrides/focus) that
  // shouldn't survive a project switch — called by every path that changes
  // activeProject below.
  const resetProjectScopedUiState = () => {
    setPendingWorkspaceFile(null)
    setPendingCanvasFocus(null)
    setPendingOverride(null)
    setFocusTarget(null)
  }

  const applyProjectInfo = (info: WorkspaceInfo) => {
    resetProjectScopedUiState()
    setActiveProject(info.root ? { path: info.root, name: info.name ?? tabLabelFor(info.root) } : null)
    setIsScratch(!!info.isScratch)
    refreshRecentProjects()
  }

  // File > Open Project… — same native-picker flow WorkspaceView's own
  // "Choose Workspace Folder…" button uses.
  const onOpenProject = async () => {
    const result = await openWorkspace()
    if (!result || 'error' in result) return
    applyProjectInfo(result)
    switchTo('workspace')
  }

  // File > Open Recent — reopens a known path without the picker dialog.
  const onOpenRecentProject = async (path: string) => {
    const result = await openRecentProject(path)
    if (!result || 'error' in result) return
    applyProjectInfo(result)
    switchTo('workspace')
  }

  // File > Open Recent > Clear Recent Projects — forgets the list only. The
  // open project (and every other window's) is left alone, so it reappears in
  // the list the next time it's opened. Renders whatever the main process says
  // the list now is (rather than assuming empty), so a failed clear shows the
  // still-present entries instead of an empty menu that refills on the next
  // refetch — the exact "clicking it did nothing visible" symptom this had
  // when the running main process predated the IPC handler.
  const onClearRecentProjects = async () => {
    const pending = clearRecentProjects()
    // No bridge method at all (web transport, or a preload older than this
    // renderer) — nothing was cleared, so don't blank the list as if it were.
    if (!pending) {
      console.error('Clear Recent Projects is unavailable in this build')
      return
    }
    try {
      setRecentProjects((await pending).projects)
    } catch (e) {
      console.error('Clear Recent Projects failed', e)
      refreshRecentProjects()
    }
  }

  // File > New Window — opens a brand-new, blank OS window (its own
  // independent project; see electron/main.cjs's per-window roots). This
  // window is left entirely untouched: its project, tabs, and Planning board
  // all stay exactly as they are.
  const onNewWindow = async () => {
    await newWindow()
  }

  // File > Save Project — always available. An unsaved (scratch) project asks
  // for a folder and moves there (see electron/main.cjs's saveScratchToFolder);
  // a real project is already its folder, so saving it means writing the
  // Canvas/editor autosaves still waiting on their debounce.
  const onSaveProject = async () => {
    await flushPendingWrites()
    if (!isScratch) {
      setGitRefreshToken((v) => v + 1)
      return
    }
    const result = await saveScratchToFolder()
    if (!result || 'error' in result) return
    applyProjectInfo(result)
  }

  // File > Save Project As… — copies the project (scratch or real) into a new
  // folder and switches this window to the copy.
  const onSaveProjectAs = async () => {
    await flushPendingWrites()
    const result = await saveProjectAs()
    if (!result || 'error' in result) return
    applyProjectInfo(result)
  }

  const onCreatePlan = (plan: SavedPlan) => {
    setPlans((prev) => [...prev, plan])
  }

  const onDeletePlan = (id: string, opts?: { deleteFiles?: boolean; deleteNodes?: boolean }) => {
    setPlans((prev) => prev.filter((p) => p.id !== id))
    // Returned (not fire-and-forget) so the modal can await the real delete
    // before reloading the graph — a deleteNodes delete mutates notes.json, and
    // the Planning view must re-read it to drop the removed nodes on screen.
    return deletePlan(id, opts)
  }

  // Reflects an in-view plan mutation (Planning's addLink pulls a cross-plan
  // node into the active plan's nodeIds — see PlanningView.ViewModel) back
  // into this owning state, same map-in-place update onCodeGenerated uses
  // after appendPlanGeneratedFiles.
  const onUpdatePlan = (plan: SavedPlan) => {
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? plan : p)))
  }

  // Plain click: switch the primary pane, same as always. Ctrl/Cmd-click:
  // toggle `id` in the secondary (split) pane instead — clicking the item
  // already open there closes the split; clicking a different one swaps it
  // in. Never lets the same category sit in both panes at once (closes the
  // split rather than showing a redundant duplicate) — including the
  // reverse direction, a plain click that lands on whatever's currently the
  // secondary.
  const switchTo = (id: string, e?: React.MouseEvent) => {
    setMountedCategories((prev) => (prev.includes(id) ? prev : [...prev, id]))
    if (e?.metaKey || e?.ctrlKey) {
      if (id === activeCategory) return
      setSecondaryCategory((prev) => (prev === id ? null : id))
      return
    }
    setActiveCategory(id)
    setSecondaryCategory((prev) => (prev === id ? null : prev))
  }

  // Fired every time the AI chat streams in a new plan node — brings the
  // user to Planning's AI tab so they watch it build live instead of
  // staying wherever they last navigated.
  const jumpToAiTab = () => {
    switchTo('planning')
    setFocusTarget({ mapId: 'claude' })
  }

  // Fired once the generate_code tool stages content for an approved plan
  // node (see PlanningView's headless "Generate Code" request) — opens the
  // Code Editor on the staged (unsaved) content inside Workspace, auto-
  // opening one first if none is set yet (reuses the existing "Choose
  // Workspace Folder…" native picker, whose own "New Folder" button already
  // covers "create one" — no separate creation UI needed). `planId`, when
  // present, records which SavedPlan tab was active when this ran, so a
  // later "Delete Plan" can offer to clean up the files it produced.
  const onCodeGenerated = async (planNodeId: string, files: GeneratedFile[], planId?: string) => {
    const first = files[0]
    if (!first) return
    const info = await getWorkspaceInfo()
    if (!info.root) {
      const result = await openWorkspace()
      if (!result || 'error' in result) return
      applyProjectInfo(result)
    }
    setPendingOverride({ path: first.path, content: first.content, planNodeId })
    setPendingWorkspaceFile({ name: tabLabelFor(first.path), path: first.path })
    if (planId) {
      appendPlanGeneratedFiles(planId, files.map((f) => f.path))
        .then(({ plan }) => setPlans((prev) => prev.map((p) => (p.id === plan.id ? plan : p))))
        .catch(() => {})
    }
    switchTo('workspace')
  }

  // Project-wide search and quick-open's (ROADMAP.md's Phase 1) shared jump
  // target — always the open Workspace; there's nothing to jump to when
  // none is open (CommandPalette shows "Choose a Workspace folder" instead
  // of offering results in that case).
  const jumpToProjectFile = async (path: string, opts?: { line?: number }) => {
    const info = await getWorkspaceInfo()
    if (!info.root) return
    setPendingWorkspaceFile({ name: tabLabelFor(path), path, line: opts?.line })
    switchTo('workspace')
  }

  // Cross-section jump targets — the Planning/Canvas counterparts to
  // jumpToProjectFile above, used by "Show in Planning"/"Show in Canvas"
  // context-menu items in the Workspace tree, Planning's node list, and
  // Canvas's layers panel.
  const jumpToPlanningNode = (mapId: GraphMapId, nodeId: string) => {
    switchTo('planning')
    setFocusTarget({ mapId, nodeId })
  }

  const jumpToCanvasComponent = (filePath: string) => {
    switchTo('canvas')
    setPendingCanvasFocus({ filePath })
  }

  // Bridges lspClient.ts's SleipnirWorkspace (go-to-definition/rename landing
  // on a file that isn't already an open tab) to jumpToProjectFile above.
  // Which scheme produced `relPath` depends on which language server
  // resolved it (see CodeEditorView.ViewModel's lspTargetForScope /
  // lspClient.ts's LspRoot):
  //   - Sleipnir's own repo (repoRelativeRoot non-null): `relPath` is
  //     REPO_ROOT-relative, so strip the current repoRelativeRoot prefix to
  //     recover the workspace-relative path jumpToProjectFile expects — a
  //     no-op slice(0) when the Workspace root IS REPO_ROOT itself.
  //   - An external Workspace project (repoRelativeRoot null): `relPath` is
  //     already workspace-relative (that scheme has no prefix to strip).
  // Silently no-ops with no workspace open at all — LSP wouldn't have been
  // attached to produce this path in the first place.
  const openLspTarget = async (relPath: string) => {
    const info = await getWorkspaceInfo()
    if (!info.root) return
    if (info.repoRelativeRoot == null) {
      jumpToProjectFile(relPath)
      return
    }
    const prefix = info.repoRelativeRoot ? `${info.repoRelativeRoot}/` : ''
    if (!relPath.startsWith(prefix)) return
    jumpToProjectFile(relPath.slice(prefix.length))
  }
  // No deps array — cheap (just reassigns a module-level variable in
  // lspClient.ts), and always closes over the latest jumpToProjectFile
  // without risking staleness.
  useEffect(() => {
    registerLspFileOpener((path) => { void openLspTarget(path) })
  })

  const onSave = async () => {
    await browserRefs.current.get(activeCategory)?.save()
    // A save wrote to disk — tell Source Control to re-read status even if it's
    // sitting hidden behind the current category (see gitRefreshToken).
    setGitRefreshToken((v) => v + 1)
  }

  const onSaveAll = async () => {
    await browserRefs.current.get(activeCategory)?.saveAll()
    setGitRefreshToken((v) => v + 1)
  }

  // `.planning/` paths that no longer exist — listed in the Problems dock and
  // marked on Planning's graph. Lives here rather than in PlanningView so the
  // warning reaches you from any section, not only while Planning is open.
  const planningHealth = usePlanningHealth(activeProject?.path)
  // Moves file statuses forward for changes made outside Sleipnir's editor.
  useStatusReconciler(activeProject?.path)

  // Problems dock "SHOW": the first thing referencing the missing path — a
  // note node on its own map, or the plan tab holding the asset (and its node,
  // for a single file; a missing folder has no node of its own).
  const showMissingInPlanning = (missing: MissingPlanningRef) => {
    const ref = missing.refs[0]
    if (!ref) return
    if (ref.kind === 'note' && ref.nodeId) {
      jumpToPlanningNode(ref.mapId ?? 'todo', ref.nodeId)
    } else if (ref.planId) {
      switchTo('planning')
      setFocusTarget({
        mapId: ref.planId,
        nodeId: ref.kind === 'assetPath' ? `workspace-asset/${ref.planId}/${missing.path}` : undefined,
      })
    }
  }

  const navItems: NavRailItem[] = NAV_ITEMS

  const categoryLabel = (id: string): string => navItems.find((n) => n.id === id)?.title ?? id

  // ProblemsDock row click: land on the owning category, then that
  // category's own FolderBrowserView instance activates the specific tab —
  // it's already mounted (ProblemsDock only ever lists tabs from instances
  // that are already tracked in browserRefs), so the ref is there to reach
  // immediately, no need to wait for a remount.
  const onJumpToProblem = (categoryId: string, path: string) => {
    switchTo(categoryId)
    browserRefs.current.get(categoryId)?.focusTab(path)
  }

  const renderCategory = (id: string) => {
    switch (id) {
      case 'planning':
        return (
          <PlanningView
            // Forces a full remount on project switch so Notes/Plans/Archive
            // load fresh from the new project's own .planning/ folder rather
            // than showing stale state from whatever was open before.
            key={activeProject?.path ?? 'no-project'}
            focusTarget={focusTarget}
            onFocusTargetConsumed={() => setFocusTarget(null)}
            onCodeGenerated={onCodeGenerated}
            plans={plans}
            onCreatePlan={onCreatePlan}
            onDeletePlan={onDeletePlan}
            onUpdatePlan={onUpdatePlan}
            onOpenFile={(path) => jumpToProjectFile(path)}
            onShowInCanvas={jumpToCanvasComponent}
            canvasComponentPaths={canvasComponentPaths}
            onWorkspaceChanged={refreshWorkspaceTree}
            missingPaths={planningHealth.missingPaths}
          />
        )
      case 'canvas':
        return (
          <CanvasView
            // Same remount-on-project-switch reasoning as PlanningView above
            // — boards live in the open project's own .canvas/.boards/
            // folder, so a stale instance can't leak content across a switch.
            key={activeProject?.path ?? 'no-project'}
            activeProject={activeProject}
            // Keeps Ctrl+S working for a research doc opened in Canvas's Docs
            // pane, which is the same FolderBrowserView the Research tab was.
            docsBrowserRef={(h) => setBrowserRef('canvas', h)}
            pendingFocus={pendingCanvasFocus}
            onFocusConsumed={() => setPendingCanvasFocus(null)}
            onOpenFile={(path) => jumpToProjectFile(path)}
            onShowInPlanning={jumpToPlanningNode}
            onWorkspaceChanged={refreshWorkspaceTree}
          />
        )
      case 'workspace':
        return (
          <WorkspaceView
            // Same remount-on-project-switch reasoning as PlanningView above
            // — also covers a switch triggered from the File menu rather
            // than this view's own "Choose/Switch Folder…" button.
            key={activeProject?.path ?? 'no-project'}
            ref={(h) => setBrowserRef('workspace', h)}
            initialFile={pendingWorkspaceFile}
            pendingOverride={pendingOverride}
            onOverrideSaved={() => setPendingOverride(null)}
            onPlanCreated={(plan) => {
              onCreatePlan(plan)
              switchTo('planning')
              setFocusTarget({ mapId: plan.id })
            }}
            onPlanUpdated={onUpdatePlan}
            onProjectOpened={applyProjectInfo}
            recentProjects={recentProjects}
            onOpenRecentProject={onOpenRecentProject}
            onShowInPlanning={jumpToPlanningNode}
            onShowInCanvas={jumpToCanvasComponent}
            canvasComponentPaths={canvasComponentPaths}
            onPathMoved={handlePathMoved}
            onPathDeleted={handlePathDeleted}
          />
        )
      case 'validation':
        return (
          // Remounts on project switch — a fresh Validation session per
          // project, same reasoning as every other remount-on-switch case
          // here (a stale instance can't leak a previous project's results).
          <ValidationView key={activeProject?.path ?? 'no-project'} />
        )
      case 'source-control':
        return (
          <SourceControlView
            // Remounts on project switch so status/branches/diff refetch
            // against whichever project's own repo is now open (see
            // tools/git-control.mjs) instead of showing the previous
            // project's stale git state.
            key={activeProject?.path ?? 'no-project'}
            // Becomes true when this category is the visible pane (primary or
            // split) — the view refreshes git status on that transition, since
            // switching TO it is only a display toggle, never a remount.
            active={activeCategory === 'source-control' || secondaryCategory === 'source-control'}
            // Re-read status the moment any in-app save writes to disk.
            refreshToken={gitRefreshToken}
            onOpenFile={(path) => jumpToProjectFile(path)}
          />
        )
      case 'settings':
        return <SettingsView sectionRequest={settingsRequest} />
      default:
        return null
    }
  }

  return (
    <ThemeProvider theme={theme}>
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
          projectName={activeProject?.name ?? null}
          isScratch={isScratch}
          onSaveProject={onSaveProject}
          onSaveProjectAs={onSaveProjectAs}
          onOpenProject={onOpenProject}
          recentProjects={recentProjects}
          onOpenRecentProject={onOpenRecentProject}
          onClearRecentProjects={onClearRecentProjects}
          onNewWindow={onNewWindow}
          onOpenLicense={() => {
            setSettingsRequest({ id: 'license' })
            switchTo('settings')
          }}
        />

        <Frame flow="horizontal" grow minH={0} clipContent>
          <NavRail
            items={navItems}
            activeId={activeCategory}
            secondaryId={secondaryCategory}
            onSelect={switchTo}
            bottomAction={{
              title: 'Settings',
              icon: 'settings',
              active: activeCategory === 'settings',
              onClick: () => switchTo('settings'),
            }}
          />

          {/* Every visited category mounts exactly once and stays mounted for
              the rest of the session (never remounted just for switching
              panes/tabs) — only its position here changes: full-width when
              it's the sole pane, left/right half when a split is open, or
              display:none when it's neither pane right now. */}
          <Frame flow="vertical" grow minW={0} clipContent fill={{ solid: 'bg-1' }} style={{ position: 'relative' }}>
            {mountedCategories.map((id) => {
              const isPrimary = id === activeCategory
              const isSecondary = id === secondaryCategory
              const style: React.CSSProperties = isPrimary
                ? secondaryCategory
                  ? { position: 'absolute', top: 0, bottom: 0, left: 0, right: '50%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-1)' }
                  : { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }
                : isSecondary
                  ? { position: 'absolute', top: 0, bottom: 0, left: '50%', right: 0, display: 'flex', flexDirection: 'column' }
                  : { position: 'absolute', inset: 0, display: 'none' }
              return (
                <div key={id} style={style}>
                  {isSecondary && (
                    <button
                      onClick={() => setSecondaryCategory(null)}
                      title="Close split view"
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        zIndex: 10,
                        background: 'rgba(0,0,0,0.5)',
                        border: 'none',
                        borderRadius: 3,
                        width: 20,
                        height: 20,
                        color: 'var(--text-2)',
                        cursor: 'pointer',
                        fontSize: 13,
                        lineHeight: '20px',
                      }}
                    >
                      ×
                    </button>
                  )}
                  {/* Non-Planning views are lazy chunks (see app/lazyViews.ts),
                      normally already warmed by the boot screen. */}
                  <Suspense fallback={null}>{renderCategory(id)}</Suspense>
                </div>
              )
            })}
          </Frame>
        </Frame>

        {/* Reclaims DOCK_PANEL_HEIGHT from the flex column above (NavRail +
            category content, both `grow`) whenever a dock is open — the
            fixed-position panel below then lands exactly in this now-empty
            strip instead of covering the app's real content (the NavRail's
            Settings gear included). */}
        {activeDock && <Frame h={DOCK_PANEL_HEIGHT} shrink={0} />}

        <StatusBar
          activeDock={activeDock}
          onToggleDock={toggleDock}
          problems={problemsSummary}
          running={run.active}
          runControl={<RunControl run={run} onShowPanel={() => setActiveDock('run')} />}
        />
      </Frame>
      {/* Opens itself whenever a main-process Pro gate stops an action here. */}
      <UpgradePrompt />
      <TerminalDock
        open={activeDock === 'terminal'}
        onOpenChange={(o) => setActiveDock(o ? 'terminal' : null)}
      />
      <AgentDock
        open={activeDock === 'agent'}
        onOpenChange={(o) => setActiveDock(o ? 'agent' : null)}
        onPlanNodeCreated={jumpToAiTab}
      />
      <ProblemsDock
        open={activeDock === 'problems'}
        onOpenChange={(o) => setActiveDock(o ? 'problems' : null)}
        browserRefs={browserRefs}
        categoryLabel={categoryLabel}
        onJump={onJumpToProblem}
        onSummaryChange={setProblemsSummary}
        missingPlanning={planningHealth.missing}
        planningActions={{
          onRelink: planningHealth.relink,
          onRelinkAll: planningHealth.relinkAll,
          onRemove: planningHealth.remove,
          onShow: showMissingInPlanning,
        }}
      />
      {/* Last of the docks on purpose: expanded, it covers the window below
          the title bar — including the sibling docks' floating toggles. */}
      <RunDock run={run} open={activeDock === 'run'} onOpenChange={(o) => setActiveDock(o ? 'run' : null)} />
      <CommandPalette onJumpToFile={jumpToProjectFile} />
    </ThemeProvider>
  )
}

// ThemeController owns the app-wide theme (persisted) and must sit above App
// so App and every view can read the selection via useAppTheme(). KeybindingsController
// is the same shape for keybindings — see 00_keybindings/KeybindingsController.tsx.
export default function AppRoot() {
  return (
    <ThemeController>
      <KeybindingsController>
        <App />
      </KeybindingsController>
    </ThemeController>
  )
}
