import { lazy } from 'react'

// Everything that isn't on screen at launch (Planning is) loads as its own
// chunk, so the first paint only has to parse what it shows. Each loader is
// shared by its lazy() component and warmViewsWhenIdle(), so the warm-up
// fetches exactly the chunk a first switch would otherwise fetch on demand.
const loadCanvas = () => import('../canvas/CanvasView')
const loadWorkspace = () => import('./Workspace/WorkspaceView')
const loadValidation = () => import('../validation/ValidationView')
const loadSourceControl = () => import('../source-control/SourceControlView')
const loadSettings = () => import('./SettingsView/SettingsView')
const loadTerminal = () => import('./Terminal/Terminal')

export const CanvasView = lazy(() => loadCanvas().then((m) => ({ default: m.CanvasView })))
export const WorkspaceView = lazy(() => loadWorkspace().then((m) => ({ default: m.WorkspaceView })))
export const ValidationView = lazy(loadValidation)
export const SourceControlView = lazy(loadSourceControl)
export const SettingsView = lazy(() => loadSettings().then((m) => ({ default: m.SettingsView })))
export const Terminal = lazy(() => loadTerminal().then((m) => ({ default: m.Terminal })))

// Most likely next first: Canvas, then the rest. The editor (Workspace) and
// the terminal are the heaviest chunks, so they come last.
const WARM_ORDER = [loadCanvas, loadSourceControl, loadSettings, loadValidation, loadWorkspace, loadTerminal]

/**
 * Fetches and evaluates every lazy view's chunk ahead of first use, one per
 * idle moment after the app is up — never on the boot screen's clock, so the
 * views can grow (3D, rendering) without slowing launch.
 */
export function warmViewsWhenIdle(): void {
  const idle = (fn: () => void) =>
    typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 200)
  const next = (i: number) => {
    if (i >= WARM_ORDER.length) return
    idle(() => void WARM_ORDER[i]().catch(() => {}).finally(() => next(i + 1)))
  }
  next(0)
}
