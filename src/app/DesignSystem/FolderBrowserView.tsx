import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { IconButton } from '../UIKit/IconButton/IconButton'
import { LeftRailing } from './LeftRailingView'
import { WidgetShell, ResizeHandle } from './WidgetShell'
import { WorkspaceHeader } from '../WorkspaceHeader/WorkspaceHeader'
import { CodeEditorView, type CodeEditorHandle } from './CodeEditorView'
import { LOADING_PLACEHOLDER } from './CodeEditorView.ViewModel'
import { writeRepoFile, writeWorkspaceFile, createWorkspaceFile, createWorkspaceDir, deleteWorkspacePath, deleteNote, planNodesUnderPath } from '../../00_planning/api/sleipnirApi'
import { useFolderBrowserViewModel } from './FolderBrowserView.ViewModel'
import { registerPendingWrite } from '../pendingWrites'
import type { FolderBrowserHandle, FolderBrowserViewProps, PaneId, PaneState } from './iFolderBrowserView'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// The unified "browse a folder, preview a file, edit a file" component —
// replaces three separate hand-built implementations (DesignLibraryView,
// PrototypeList's scaffolded half, FolderWidgetView) that all did the same
// job. Each caller is a thin wrapper configuring `root`/`scope`/preview/
// create behavior; this component has no knowledge of "Components" vs "a
// widget" vs "Prototypes". Tabs are LOCAL to this instance — never shared
// with any other browser or with App.tsx's category switching.
export const FolderBrowserView = forwardRef<FolderBrowserHandle, FolderBrowserViewProps>(function FolderBrowserView(
  props,
  ref,
) {
  const { scope, root, rootLabel, readOnly, headerAction, getPreview, supportsCreate, pendingOverride, onOverrideSaved, folderAction, fileAction, onAddToPlan, supportsAddNode, onPlanUpdated, onImportsChanged, getGraphNodes, onLinkResolved, repoRelativeRoot, workspaceRoot, onShowInPlanning, onShowInCanvas, planNodeLinks, canvasComponentPaths, onMoved, onPathDeleted } = props
  const {
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
  } = useFolderBrowserViewModel(props)
  const editorRefs = useRef<Map<string, CodeEditorHandle | null>>(new Map())

  // Every dirty tab that would have autosaved anyway, written now — for File ▸
  // Save Project and window close (see app/pendingWrites). Staged AI content
  // is left alone: it only ever reaches disk through an explicit human save.
  const latest = useRef({ panes, pendingOverride })
  latest.current = { panes, pendingOverride }
  useEffect(
    () =>
      registerPendingWrite(async () => {
        const { panes: p, pendingOverride: override } = latest.current
        await Promise.all(
          [...p.primary.tabs, ...p.secondary.tabs]
            .filter((t) => t.path !== override?.path)
            .map((t) => editorRefs.current.get(t.path))
            .filter((h): h is CodeEditorHandle => !!h?.dirty)
            .map((h) => h.save()),
        )
      }),
    [],
  )

  useImperativeHandle(ref, () => ({
    save: async () => {
      const activePath = panes[focusedPane].activeTabPath
      if (!activePath) return
      await editorRefs.current.get(activePath)?.save()
    },
    saveAll: async () => {
      const allTabs = [...panes.primary.tabs, ...panes.secondary.tabs]
      await Promise.all(
        allTabs
          .map((t) => editorRefs.current.get(t.path))
          .filter((h): h is CodeEditorHandle => !!h?.dirty)
          .map((h) => h.save()),
      )
    },
    getProblems: () => {
      const allTabs = [...panes.primary.tabs, ...panes.secondary.tabs]
      return allTabs
        .map((t) => ({ path: t.path, count: editorRefs.current.get(t.path)?.problemCount ?? 0 }))
        .filter((p) => p.count > 0)
    },
    focusTab: (path: string) => {
      const pane: PaneId = panes.secondary.tabs.some((t) => t.path === path) ? 'secondary' : 'primary'
      if (panes[pane].tabs.some((t) => t.path === path)) activateTab(pane, path)
      else openTab(path)
    },
    refresh,
  }))

  const focusedActiveTab = panes[focusedPane].activeTabPath
  const activeTabForPreview = [...panes.primary.tabs, ...panes.secondary.tabs].find((t) => t.path === focusedActiveTab)
  const preview = activeTabForPreview && getPreview ? getPreview(activeTabForPreview.label, activeTabForPreview.path) : undefined

  // Fresh notes lookup per open of the delete modal (stable identity so
  // LeftRailing's effect doesn't refetch on every re-render). planNodesUnderPath
  // is a stable module import (see sleipnirApi.ts), so no deps. Only wired for
  // scope:'workspace' below, where paths and a scaffolded node's filePath
  // share the same root.
  const findPlanNodes = useCallback(planNodesUnderPath, [])
  const deletePlanNodes = useCallback(async (ids: string[]) => {
    await Promise.all(ids.map((id) => deleteNote(id)))
  }, [])

  // Tab strip's own "+" (see WorkspaceTabStrip) — universal add-a-file
  // shortcut for Workspace/Research, mirroring LeftRailing's root "+" but
  // reachable without opening the sidebar. Same scope:'workspace' gate as
  // LeftRailing's own createFile prop above; undefined elsewhere hides the
  // control entirely (e.g. Planning, which renders its own WorkspaceHeader
  // directly rather than through this component). Always opens into the
  // focused pane, like any other openTab call.
  const handleAddTab = scope === 'workspace' && supportsCreate
    ? async (name: string) => {
        const path = root ? `${root}/${name}` : name
        try {
          await createWorkspaceFile(path, '')
          refresh()
        } catch {
          // Already exists (or a transient error) — opening it below still
          // gets the user to the same file either way.
        }
        openTab(path)
      }
    : undefined

  // One pane's tab-panel stack: every open tab in that pane, absolutely
  // positioned, with only the pane's own active tab visible — same approach
  // as the pre-split single-pane view, just parameterized by pane state so
  // both columns can render it. `editorRefs` stays keyed by path alone (not
  // path+pane) because a path is never open in both panes at once (see
  // iFolderBrowserView.tsx's PaneState doc comment).
  const renderPaneEditors = (paneState: PaneState) => (
    <Frame grow minH={0} style={{ position: 'relative' }}>
      {paneState.tabs.map((tab) => {
        const isOverrideActive = !!(pendingOverride && pendingOverride.path === tab.path)
        return (
          <div
            key={tab.path}
            style={{ position: 'absolute', inset: 0, display: tab.path === paneState.activeTabPath ? 'flex' : 'none' }}
          >
            <CodeEditorView
              ref={(handle) => {
                if (handle) editorRefs.current.set(tab.path, handle)
                else editorRefs.current.delete(tab.path)
              }}
              path={tab.path}
              value={isOverrideActive ? pendingOverride!.content : contentByPath[tab.path] ?? LOADING_PLACEHOLDER}
              readOnly={readOnly}
              writeFile={scope === 'repo' ? writeRepoFile : scope === 'workspace' ? writeWorkspaceFile : undefined}
              suppressAutoSave={isOverrideActive}
              onSaved={isOverrideActive ? () => onOverrideSaved?.(pendingOverride!.planNodeId) : undefined}
              scope={scope}
              repoRelativeRoot={repoRelativeRoot}
              workspaceRoot={workspaceRoot}
              revealLine={tab.line}
              onImportsChanged={onImportsChanged}
              getGraphNodes={getGraphNodes}
              onLinkResolved={onLinkResolved}
            />
          </div>
        )
      })}
    </Frame>
  )

  const allOpenPaths = new Set([...panes.primary.tabs, ...panes.secondary.tabs].map((t) => t.path))

  return (
    <WidgetShell
      rail={(width) => (
        <LeftRailing
          tree={liveTree}
          rootPath={root}
          rootLabel={rootLabel}
          headerAction={headerAction?.(refresh)}
          archivedEntries={archivedEntries}
          activePath={focusedActiveTab ?? ''}
          openPaths={allOpenPaths}
          newPaths={newPaths}
          onSelectFile={(file) => openTab(file.path, file.name)}
          onChanged={refresh}
          width={width}
          readOnly={readOnly || !supportsCreate}
          // Workspace supplies its own Add file / Add folder header buttons (via
          // headerAction), so the rail's own root "+" would be redundant; Research
          // (workspace scope, no headerAction) still gets it for root creates.
          hideRootCreate={scope === 'workspace' && !!headerAction}
          tierFilterOptions={scope === 'src' ? undefined : []}
          folderAction={folderAction}
          fileAction={fileAction}
          onAddToPlan={onAddToPlan}
          createFile={scope === 'workspace' ? createWorkspaceFile : undefined}
          createDir={scope === 'workspace' ? createWorkspaceDir : undefined}
          onMutated={scope === 'workspace' ? async () => {} : undefined}
          onMoved={scope === 'workspace' ? onMoved : undefined}
          supportsArchive={scope === 'src'}
          deletePath={scope === 'workspace' ? deleteWorkspacePath : undefined}
          onDeleted={(path, isDir) => {
            closeTabsUnder(path, isDir)
            void onPathDeleted?.(path)
          }}
          findPlanNodes={scope === 'workspace' ? findPlanNodes : undefined}
          deletePlanNodes={scope === 'workspace' ? deletePlanNodes : undefined}
          supportsAddNode={supportsAddNode}
          onPlanUpdated={onPlanUpdated}
          onShowInPlanning={onShowInPlanning}
          onShowInCanvas={onShowInCanvas}
          planNodeLinks={planNodeLinks}
          canvasComponentPaths={canvasComponentPaths}
        />
      )}
      header={
        <WorkspaceHeader
          tabs={panes.primary.tabs.map((t) => ({ id: t.path, label: t.label, closable: true }))}
          activeTabId={panes.primary.activeTabPath ?? ''}
          onActivateTab={(path) => activateTab('primary', path)}
          onCloseTab={(path) => closeTab('primary', path)}
          onAddTab={handleAddTab}
          // Split Right — hidden once already split (v1 is exactly 2 panes,
          // see ROADMAP.md) and whenever a preview pane is configured, since
          // no live caller pairs getPreview with a second editor column yet.
          actions={
            !isSplit && panes.primary.activeTabPath && !getPreview ? (
              <IconButton icon="layout-columns" title="Split Right" onClick={splitRight} />
            ) : undefined
          }
        />
      }
      preview={preview}
      code={
        panes.primary.tabs.length === 0 && !isSplit ? (
          <Frame flow="vertical" align="center" justify="center" grow gap={16}>
            <span style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', ...MONO }}>
              Select a file to start
            </span>
            {headerAction && (
              <Frame flow="horizontal" align="center" gap={6}>
                {headerAction(refresh)}
              </Frame>
            )}
          </Frame>
        ) : (
          <Frame flow="horizontal" grow minH={0}>
            <Frame flow="vertical" grow minH={0} minW={0} onMouseDown={() => focusPane('primary')}>
              {panes.primary.tabs.length === 0 ? (
                <Frame flow="vertical" align="center" justify="center" grow>
                  <span style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', ...MONO }}>
                    Select a file to start
                  </span>
                </Frame>
              ) : (
                renderPaneEditors(panes.primary)
              )}
            </Frame>
            {isSplit && (
              <>
                <ResizeHandle axis="x" onMouseDown={startPaneDrag} />
                <Frame flow="vertical" shrink={0} minH={0} w={secondaryPaneWidth} onMouseDown={() => focusPane('secondary')}>
                  <WorkspaceHeader
                    tabs={panes.secondary.tabs.map((t) => ({ id: t.path, label: t.label, closable: true }))}
                    activeTabId={panes.secondary.activeTabPath ?? ''}
                    onActivateTab={(path) => activateTab('secondary', path)}
                    onCloseTab={(path) => closeTab('secondary', path)}
                    actions={<IconButton icon="x" title="Close pane" onClick={closeSecondaryPane} size={22} iconSize={13} />}
                  />
                  {renderPaneEditors(panes.secondary)}
                </Frame>
              </>
            )}
          </Frame>
        )
      }
    />
  )
})
