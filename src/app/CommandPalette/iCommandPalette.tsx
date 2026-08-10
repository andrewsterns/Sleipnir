export interface CommandPaletteProps {
  /** Jumps to a chosen file — see App.tsx's jumpToProjectFile (ROADMAP.md's Phase 1). Always the open Workspace — quick-open has nothing to search when none is open. */
  onJumpToFile: (path: string, opts?: { line?: number; scope?: 'workspace' }) => void
}
