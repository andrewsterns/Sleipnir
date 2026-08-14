import { useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { lintGutter, diagnosticCount } from '@codemirror/lint'
import { languageForPath, isRunnablePath } from './codeEditorLanguages'
import { tacticalEditorTheme, tacticalCodeHighlighting } from './codeEditorTheme'
import { writeFile as writeSrcFile, runScript, type RunResult } from '../../00_planning/api/sleipnirApi'
import { getTypeScriptLspClient, lspLanguageIdForPath, uriForPath, goToDefinitionOnModClick } from './lspClient'
import { graphLinkExtension } from './graphLinkExtension'
import type { GraphNode } from '../../00_planning/graph/types'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// Shared with FolderBrowserView.tsx's `value` ternary — a search-result/
// quick-open jump's revealLine must not fire against this placeholder
// (its doc is far too short for most line targets, and — worse — would mark
// that path+line "already revealed" before the real content even arrives,
// permanently swallowing the real reveal). Exported here rather than
// hardcoded in both places so the two call sites can't drift apart.
export const LOADING_PLACEHOLDER = '// Loading source…'

// `path`'s meaning depends on which scope's FolderBrowserView hosts this
// editor (see CodeEditorViewProps.scope's doc comment) but the LSP URI
// scheme (lspClient.ts's uriForPath) always wants a REPO_ROOT-relative path.
// Returns null to mean "don't attach LSP at all" — scope:'workspace' files
// live under a completely different root tsserver (fixed at REPO_ROOT) has
// never heard of; attempting to open them under a fabricated REPO_ROOT path
// used to silently send a bogus didOpen for a nonexistent/wrong file.
function repoRelativePathForScope(scope: 'src' | 'repo' | 'workspace', path: string): string | null {
  if (scope === 'workspace') return null
  if (scope === 'repo') return path
  return `src/${path}`
}

export function useCodeEditorViewModel({
  path,
  value,
  readOnly,
  suppressAutoSave,
  startDirty,
  writeFile = writeSrcFile,
  scope = 'src',
  revealLine,
  onImportsChanged,
  getGraphNodes,
  onLinkResolved,
}: {
  path: string
  value: string
  readOnly?: boolean
  /** When true, the 1.2s debounced autosave never fires — only the explicit Save button/Ctrl+S can persist. Used for staged AI-generated content awaiting human review (see DesignLibrary.view.tsx's pendingOverride). */
  suppressAutoSave?: boolean
  /** Marks the editor dirty/unsaved from the moment it mounts — used alongside suppressAutoSave so staged content shows UNSAVED immediately, not just after the human's first keystroke. */
  startDirty?: boolean
  /** Overrides the save target — defaults to the SRC_ROOT-scoped writeFile every existing caller relies on. OpenEditorsView passes writeRepoFile instead, since File-menu-opened files can live anywhere in the repo. */
  writeFile?: (path: string, content: string) => Promise<void>
  /** See CodeEditorViewProps.scope — determines LSP path resolution (or disables LSP entirely for 'workspace'). Defaults to 'src', matching every pre-existing caller's actual usage. */
  scope?: 'src' | 'repo' | 'workspace'
  /** See CodeEditorViewProps.revealLine. */
  revealLine?: number
  /** Fired right after a successful save with the path and the just-saved content — WorkspaceView uses this to re-scan the file's real imports and reconcile the corresponding node's graph edges (see tools/sleipnir-backend.mjs#setNodeBorrows). No-op when omitted (every pre-existing caller). */
  onImportsChanged?: (path: string, content: string) => void
  /** Live getter (not a snapshot) for the "##token" completion extension's candidate pool — see graphLinkExtension.ts. Omit to disable ## linking entirely for this editor instance (every pre-existing caller). */
  getGraphNodes?: () => GraphNode[]
  /** Fired once a "##token" resolves and its import has been spliced into the document — `path` identifies which tab/node this happened in, since one callback is shared across every open tab in a FolderBrowserView instance. */
  onLinkResolved?: (path: string, target: GraphNode) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const lastSyncedValue = useRef(value)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [problemCount, setProblemCount] = useState(0)

  const runnable = isRunnablePath(path)

  const run = async () => {
    if (!runnable || running) return
    // Persist first — running the file on disk should reflect what's on
    // screen, not the last-saved version if they've since diverged.
    if (dirty) await save()
    setRunning(true)
    setRunResult(null)
    try {
      const result = await runScript(path)
      setRunResult(result)
    } catch (e) {
      setRunResult({ stdout: '', stderr: e instanceof Error ? e.message : String(e), exitCode: null })
    } finally {
      setRunning(false)
    }
  }

  const save = async () => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = null
    }
    const view = viewRef.current
    if (!view) return
    setStatus('saving')
    try {
      const content = view.state.doc.toString()
      await writeFile(path, content)
      setStatus('saved')
      setDirty(false)
      onImportsChanged?.(path, content)
    } catch (e) {
      setStatus('error')
      setErrorMessage(e instanceof Error ? e.message : String(e))
    }
  }

  // Debounced auto-save runs alongside the manual Save button/Ctrl+S — it
  // never replaces them, just quietly persists 1.2s after typing pauses so
  // work isn't lost if the user forgets to save explicitly.
  const AUTO_SAVE_DELAY_MS = 1200
  const scheduleAutoSave = () => {
    if (readOnly || suppressAutoSave) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => { save() }, AUTO_SAVE_DELAY_MS)
  }

  // Creates the editor — and opens the LSP document, for TS/JS files — once
  // per `path`. Deliberately does NOT depend on `value`: recreating (and
  // re-opening the LSP doc) on every value change caused a real bug where
  // the "Loading…" placeholder swapping for the real file content sent two
  // textDocument/didOpen notifications for the same file, which
  // typescript-language-server correctly rejected as "already open."
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // TypeScript/JavaScript files get real language-server-backed
    // completion/hover/etc. via the shared LSP client. Other languages get
    // syntax highlighting only for now (see codeEditorLanguages.ts). No LSP
    // at all for scope:'workspace' — see repoRelativePathForScope's comment.
    const repoRelPath = repoRelativePathForScope(scope, path)
    const lspLanguageId = repoRelPath ? lspLanguageIdForPath(path) : null
    // goToDefinitionOnModClick rides alongside the LSP plugin so the Ctrl/Cmd+
    // click "drill into" gesture is present exactly where go-to-definition can
    // resolve — TS/JS files with a repo path (never scope:'workspace').
    const lspExtension =
      lspLanguageId && repoRelPath
        ? [getTypeScriptLspClient().plugin(uriForPath(repoRelPath), lspLanguageId), goToDefinitionOnModClick]
        : []

    // "##token" linking — only meaningful for a real Workspace file with a
    // live node pool to resolve against (see graphLinkExtension's own doc
    // comment for why it's a languageData addition, not a competing
    // autocompletion() config).
    const graphLink =
      scope === 'workspace' && getGraphNodes
        ? [graphLinkExtension({ getGraphNodes, fromPath: path, onResolved: (target) => onLinkResolved?.(path, target) })]
        : []

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        ...languageForPath(path),
        ...lspExtension,
        ...graphLink,
        lintGutter(),
        tacticalEditorTheme,
        tacticalCodeHighlighting,
        EditorView.editable.of(!readOnly),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              save()
              return true
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setDirty(true)
            setStatus('idle')
            scheduleAutoSave()
          }
          // Not gated on docChanged — the LSP client pushes diagnostics as
          // their own transaction, separate from any edit to the doc.
          setProblemCount(diagnosticCount(update.state))
        }),
      ],
    })

    const view = new EditorView({ state, parent: container })
    viewRef.current = view
    lastSyncedValue.current = value
    setDirty(startDirty ?? false)
    setStatus('idle')
    setErrorMessage(null)
    setProblemCount(0)

    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
        autoSaveTimer.current = null
      }
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, readOnly])

  // Patches the document in place when `value` changes for the SAME path —
  // e.g. the initial "Loading…" placeholder being replaced by the real file
  // content once it arrives. Does not touch the editor's extensions/LSP
  // connection, and leaves cursor/undo history alone when the value hasn't
  // actually diverged from what's already in the editor.
  useEffect(() => {
    const view = viewRef.current
    if (!view || value === lastSyncedValue.current) return
    const current = view.state.doc.toString()
    lastSyncedValue.current = value
    if (current === value) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = null
    }
    setDirty(false)
    setStatus('idle')
  }, [value])

  // Reveals a search-result/quick-open line once real content has loaded —
  // deliberately a separate effect from the mount effect above (which
  // excludes `value` on purpose, see its comment) so this can react to the
  // placeholder-to-real-content swap without re-triggering LSP didOpen.
  // Keyed on path+revealLine so re-clicking a different match in an
  // already-open tab re-reveals, but re-renders with the same target don't
  // repeatedly yank the cursor away from where the user has since scrolled.
  const revealedRef = useRef<string | null>(null)
  useEffect(() => {
    const view = viewRef.current
    if (revealLine == null || !view || value === LOADING_PLACEHOLDER) return
    const key = `${path}:${revealLine}`
    if (revealedRef.current === key) return
    const lineNumber = Math.min(Math.max(revealLine, 1), view.state.doc.lines)
    const line = view.state.doc.line(lineNumber)
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    })
    revealedRef.current = key
  }, [value, revealLine, path])

  return { containerRef, dirty, status, errorMessage, save, runnable, running, runResult, run, problemCount }
}
