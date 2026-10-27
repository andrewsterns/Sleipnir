export interface PlanningWatchInfo {
  /** True when every file that changed within the debounce window was stages.json — a sprint-stage tag toggle, already reflected live via the stagesStore overlay (see stagesStore.ts). Callers can skip the heavy graph refetch and just re-sync that overlay, so a stage edit never reheats GraphCanvas's force layout. False (or omitted) for any other/mixed change, which does need a real refetch. */
  stagesOnly?: boolean
  /** True when every file that changed within the debounce window was a Canvas board — `.canvas/.boards/` (or the legacy `.planning/canvas/`, while store.ts migrates old boards out). Exists for exactly the same reason as stagesOnly: a board autosave fires every ~400ms while you drag, and treating that as a graph edit would refetch the planning graph and reheat GraphCanvas's force layout on every frame. Planning ignores these; Canvas ignores stagesOnly. */
  canvasOnly?: boolean
}

export interface PlanningWatchAPI {
  /** Fires whenever this window's open project's `.planning/` folder or Canvas board store (`.canvas/.boards/`) changes on disk — from Sleipnir's own writes, an external CLI (see tools/sleipnir-plan.mjs), a terminal AI agent, or a hand edit. See PlanningView.ViewModel.tsx's refreshAll / refreshStagesStore. */
  onChanged: (callback: (info?: PlanningWatchInfo) => void) => () => void
}

declare global {
  interface Window {
    planningWatchAPI?: PlanningWatchAPI
  }
}

// No web-transport equivalent — filesystem watching isn't possible from a
// sandboxed browser tab (see electron/planningWatcher.cjs).
export function isPlanningWatchAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.planningWatchAPI
}
