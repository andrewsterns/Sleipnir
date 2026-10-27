// Bridges the plain (non-React) lspClient module to App.tsx's openFile()
// routing (Components vs Open Files) — registered once from an App.tsx effect.
// Lets SleipnirWorkspace actually bring a not-yet-open file's tab to front for
// a cross-file LSP navigation or rename, which the library's default Workspace
// has no hook for at all (ROADMAP.md's Phase 1 — the fix for
// "go-to-definition/rename only work for already-open tabs").
//
// Its own module, not part of lspClient.ts, so App can register the opener
// without pulling CodeMirror into the startup bundle.
type LspFileOpener = (repoRelativePath: string) => void
let lspFileOpener: LspFileOpener | null = null

export function registerLspFileOpener(handler: LspFileOpener) {
  lspFileOpener = handler
}

export function getLspFileOpener(): LspFileOpener | null {
  return lspFileOpener
}
