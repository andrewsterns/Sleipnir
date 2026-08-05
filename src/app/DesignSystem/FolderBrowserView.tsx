import React, { forwardRef, useImperativeHandle, useRef } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { LeftRailing } from './LeftRailingView'
import { WidgetShell } from './WidgetShell'
import { WorkspaceHeader } from '../WorkspaceHeader/WorkspaceHeader'
import { CodeEditorView, type CodeEditorHandle } from './CodeEditorView'
import { LOADING_PLACEHOLDER } from './CodeEditorView.ViewModel'
import { writeRepoFile, writeWorkspaceFile, createWorkspaceFile, createWorkspaceDir } from '../../00_planning/api/sleipnirApi'
import { useFolderBrowserViewModel } from './FolderBrowserView.ViewModel'
import type { FolderBrowserHandle, FolderBrowserViewProps } from './iFolderBrowserView'

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
  const { scope, root, readOnly, headerAction, getPreview, supportsCreate, pendingOverride, onOverrideSaved, folderAction, fileAction, onAddToPlan } = props
  const { liveTree, archivedEntries, newPaths, tabs, activeTabPath, setActiveTabPath, openTab, closeTab, contentByPath, refresh } =
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

  return (
    <WidgetShell
      rail={(width) => (
        <LeftRailing
          tree={liveTree}
          rootPath={root}
          headerAction={headerAction?.(refresh)}
          archivedEntries={archivedEntries}
          activePath={activeTabPath ?? ''}
          newPaths={newPaths}
          onSelectFile={(file) => openTab(file.path, file.name)}
          onChanged={refresh}
          width={width}
          readOnly={readOnly || !supportsCreate}
          tierFilterOptions={scope === 'src' ? undefined : []}
          folderAction={folderAction}
          fileAction={fileAction}
          onAddToPlan={onAddToPlan}
          createFile={scope === 'workspace' ? createWorkspaceFile : undefined}
          createDir={scope === 'workspace' ? createWorkspaceDir : undefined}
          onMutated={scope === 'workspace' ? async () => {} : undefined}
          supportsArchive={scope === 'src'}
        />
      )}
      header={
        <WorkspaceHeader
          tabs={tabs.map((t) => ({ id: t.path, label: t.label, closable: true }))}
          activeTabId={activeTabPath ?? ''}
          onActivateTab={setActiveTabPath}
          onCloseTab={closeTab}
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
                    revealLine={tab.line}
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
