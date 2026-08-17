import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { LeftRailing } from './LeftRailingView'
import { WidgetShell } from './WidgetShell'
import { WorkspaceHeader } from '../WorkspaceHeader/WorkspaceHeader'
import { CodeEditorView, type CodeEditorHandle } from './CodeEditorView'
import { LOADING_PLACEHOLDER } from './CodeEditorView.ViewModel'
import { writeRepoFile, writeWorkspaceFile, createWorkspaceFile, createWorkspaceDir, deleteWorkspacePath, getNotes, deleteNote } from '../../00_planning/api/sleipnirApi'
import { useFolderBrowserViewModel } from './FolderBrowserView.ViewModel'
import type { FolderBrowserHandle, FolderBrowserViewProps } from './iFolderBrowserView'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Plan nodes are scaffolded with a Workspace-relative filePath (see
// tools/sleipnir-backend.mjs#scaffoldNodes). A file delete matches an exact
// filePath; a folder delete matches every node whose file lives under it — so
// deleting a scaffolded feature's folder can clear its nodes in one go.
async function planNodesUnderPath(path: string, isDir: boolean) {
  const { nodes } = await getNotes()
  return nodes.filter((n) =>
    !!n.filePath && (isDir ? n.filePath === path || n.filePath.startsWith(`${path}/`) : n.filePath === path),
  )
}

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
  const { scope, root, rootLabel, readOnly, headerAction, getPreview, supportsCreate, pendingOverride, onOverrideSaved, folderAction, fileAction, onAddToPlan, supportsAddNode, onPlanUpdated, onImportsChanged, getGraphNodes, onLinkResolved, repoRelativeRoot, workspaceRoot } = props
  const { liveTree, archivedEntries, newPaths, tabs, activeTabPath, setActiveTabPath, openTab, closeTab, closeTabsUnder, contentByPath, refresh } =
    useFolderBrowserViewModel(props)
  const editorRefs = useRef<Map<string, CodeEditorHandle | null>>(new Map())

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!activeTabPath) return
      await editorRefs.current.get(activeTabPath)?.save()
    },
    saveAll: async () => {
      await Promise.all(
        tabs
          .map((t) => editorRefs.current.get(t.path))
          .filter((h): h is CodeEditorHandle => !!h?.dirty)
          .map((h) => h.save()),
      )
    },
    getProblems: () =>
      tabs
        .map((t) => ({ path: t.path, count: editorRefs.current.get(t.path)?.problemCount ?? 0 }))
        .filter((p) => p.count > 0),
    focusTab: (path: string) => {
      if (tabs.some((t) => t.path === path)) setActiveTabPath(path)
    },
  }))

  const activeTab = tabs.find((t) => t.path === activeTabPath)
  const preview = activeTab && getPreview ? getPreview(activeTab.label, activeTab.path) : undefined

  // Fresh notes lookup per open of the delete modal (stable identity so
  // LeftRailing's effect doesn't refetch on every re-render). getNotes is a
  // stable module import, so no deps. Only wired for scope:'workspace' below,
  // where paths and a scaffolded node's filePath share the same root.
  const findPlanNodes = useCallback(planNodesUnderPath, [])
  const deletePlanNodes = useCallback(async (ids: string[]) => {
    await Promise.all(ids.map((id) => deleteNote(id)))
  }, [])

  // Tab strip's own "+" (see WorkspaceTabStrip) — universal add-a-file
  // shortcut for Workspace/Research, mirroring LeftRailing's root "+" but
  // reachable without opening the sidebar. Same scope:'workspace' gate as
  // LeftRailing's own createFile prop above; undefined elsewhere hides the
  // control entirely (e.g. Planning, which renders its own WorkspaceHeader
  // directly rather than through this component).
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

  return (
    <WidgetShell
      rail={(width) => (
        <LeftRailing
          tree={liveTree}
          rootPath={root}
          rootLabel={rootLabel}
          headerAction={headerAction?.(refresh)}
          archivedEntries={archivedEntries}
          activePath={activeTabPath ?? ''}
          openPaths={new Set(tabs.map((t) => t.path))}
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
          supportsArchive={scope === 'src'}
          deletePath={scope === 'workspace' ? deleteWorkspacePath : undefined}
          onDeleted={closeTabsUnder}
          findPlanNodes={scope === 'workspace' ? findPlanNodes : undefined}
          deletePlanNodes={scope === 'workspace' ? deletePlanNodes : undefined}
          supportsAddNode={supportsAddNode}
          onPlanUpdated={onPlanUpdated}
        />
      )}
      header={
        <WorkspaceHeader
          tabs={tabs.map((t) => ({ id: t.path, label: t.label, closable: true }))}
          activeTabId={activeTabPath ?? ''}
          onActivateTab={setActiveTabPath}
          onCloseTab={closeTab}
          onAddTab={handleAddTab}
        />
      }
      preview={preview}
      code={
        tabs.length === 0 ? (
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
          <Frame grow minH={0} style={{ position: 'relative' }}>
            {tabs.map((tab) => {
              const isOverrideActive = !!(pendingOverride && pendingOverride.path === tab.path)
              return (
                <div
                  key={tab.path}
                  style={{ position: 'absolute', inset: 0, display: tab.path === activeTabPath ? 'flex' : 'none' }}
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
      }
    />
  )
})
