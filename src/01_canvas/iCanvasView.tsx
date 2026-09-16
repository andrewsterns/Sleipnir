import type { FolderBrowserHandle } from '../app/DesignSystem/iFolderBrowserView'
import type { GraphMapId } from '../00_planning/graph/types'

export interface CanvasViewProps {
  /**
   * The project App.tsx currently has open. Canvas only ever follows it —
   * there is no "Choose Folder…" here, same as Research — and App.tsx keys this
   * view on the project path, so switching projects remounts the whole view and
   * there is no local state to reset. Boards live in that project's own
   * `.canvas/.boards/` folder (see model/store.ts).
   */
  activeProject: { path: string; name: string } | null
  /**
   * Registers the Docs pane's file browser with App.tsx's browserRefs map, so
   * Ctrl+S still saves an open research doc while the Canvas tab is active.
   * Only ever populated while the Docs pane is showing; it deregisters (null)
   * when collapsed, which is exactly what browserRefs' delete-on-null expects.
   */
  docsBrowserRef?: (handle: FolderBrowserHandle | null) => void
  /**
   * Set right before switchTo('canvas') by App.tsx's jumpToCanvasComponent —
   * same reactive-payload pattern as WorkspaceView's initialFile. Consumed
   * once to open whichever board owns the component at this filePath and
   * select+center it, then cleared via onFocusConsumed.
   */
  pendingFocus?: { filePath: string } | null
  onFocusConsumed?: () => void
  /** "Show in Workspace" from a layer's context menu — same jump App.tsx already gives Planning/Source Control. */
  onOpenFile?: (path: string) => void
  /** "Show in Planning" from a layer's context menu. */
  onShowInPlanning?: (mapId: GraphMapId, nodeId: string) => void
  /**
   * Fired after Canvas writes, moves, or deletes a real file in the workspace
   * (promote, push, remove). The Workspace tab's file tree only refetches on
   * mount and on project change, so a write originating anywhere else lands on
   * disk invisibly until you switch projects and back — App.tsx uses this to
   * refresh it. Not called for board autosaves (`.canvas/.boards/`): those fire
   * every ~400ms while dragging, and refetching the tree that often isn't worth it.
   */
  onWorkspaceChanged?: () => void
}
