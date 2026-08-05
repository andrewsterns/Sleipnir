import { useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { languageForPath, isRunnablePath } from './codeEditorLanguages'
import { tacticalEditorTheme, tacticalCodeHighlighting } from './codeEditorTheme'
import { writeFile, runScript, type RunResult } from '../../00_planning/api/sleipnirApi'
import { getTypeScriptLspClient, lspLanguageIdForPath, uriForPath } from './lspClient'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function useCodeEditorViewModel({
  path,
  value,
  readOnly,
}: {
  path: string
  value: string
  readOnly?: boolean
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
      await writeFile(path, view.state.doc.toString())
      setStatus('saved')
      setDirty(false)
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
    if (readOnly) return
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
    // syntax highlighting only for now (see codeEditorLanguages.ts).
    const lspLanguageId = lspLanguageIdForPath(path)
    const lspExtension = lspLanguageId
      ? [getTypeScriptLspClient().plugin(uriForPath(path), lspLanguageId)]
      : []

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        ...languageForPath(path),
        ...lspExtension,
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
        }),
      ],
    })

    const view = new EditorView({ state, parent: container })
    viewRef.current = view
    lastSyncedValue.current = value
    setDirty(false)
    setStatus('idle')
    setErrorMessage(null)

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

  return { containerRef, dirty, status, errorMessage, save, runnable, running, runResult, run }
}
