import { lazy } from 'react'

// Everything that isn't on screen at launch (Planning is) loads as its own
// chunk, so the first paint only has to parse what it shows. Each loader is
// shared by its lazy() component and preloadViews(), so the boot screen warms
// exactly the chunk the first render would otherwise fetch on demand.
const loadCanvas = () => import('../01_canvas/CanvasView')
const loadWorkspace = () => import('./Workspace/WorkspaceView')
const loadValidation = () => import('../04_validation/ValidationView')
const loadSourceControl = () => import('../06_source_control/SourceControlView')
const loadSettings = () => import('./SettingsView/SettingsView')
const loadTerminal = () => import('./Terminal/Terminal')

export const CanvasView = lazy(() => loadCanvas().then((m) => ({ default: m.CanvasView })))
export const WorkspaceView = lazy(() => loadWorkspace().then((m) => ({ default: m.WorkspaceView })))
export const ValidationView = lazy(loadValidation)
export const SourceControlView = lazy(loadSourceControl)
export const SettingsView = lazy(() => loadSettings().then((m) => ({ default: m.SettingsView })))
export const Terminal = lazy(() => loadTerminal().then((m) => ({ default: m.Terminal })))

/** Fetches and evaluates every lazy view's chunk ahead of first use. */
export function preloadViews(): Promise<unknown> {
  return Promise.all([loadCanvas(), loadWorkspace(), loadValidation(), loadSourceControl(), loadSettings(), loadTerminal()])
}
