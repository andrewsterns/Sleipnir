export interface CommandPaletteProps {
  /** Jumps to a chosen file — see App.tsx's jumpToProjectFile (ROADMAP.md's Phase 1). `scope` is passed explicitly since this component already resolved it when it fetched the file list. */
  onJumpToFile: (path: string, opts?: { line?: number; scope?: 'workspace' | 'repo' }) => void
}
