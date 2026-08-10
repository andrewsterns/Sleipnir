import React, { forwardRef, useImperativeHandle } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Dropdown } from '../UIKit/Dropdown/Dropdown'
import { useCodeEditorViewModel } from './CodeEditorView.ViewModel'
import type { GraphNode } from '../../00_planning/graph/types'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface CodeEditorViewProps {
  /** Path relative to whatever root `scope` implies — used for language detection and as the save target. Not always "from src/": see `scope`'s doc comment. */
  path: string
  value: string
  readOnly?: boolean
  onSaved?: () => void
  /** Staged AI-generated content awaiting human review — disables the 1.2s autosave (only explicit Save/Ctrl+S persists) and shows an "AI-GENERATED — UNSAVED" banner instead of the normal status pill. */
  suppressAutoSave?: boolean
  /** Overrides the save target — see CodeEditorView.ViewModel's writeFile param. */
  writeFile?: (path: string, content: string) => Promise<void>
  /**
   * Which root `path` is relative to — determines whether/how LSP attaches
   * (see ROADMAP.md's Phase 1 fix): `'src'` (default, matches every
   * pre-existing caller) means `path` is SRC_ROOT-relative; `'repo'` means
   * `path` is already REPO_ROOT-relative; `'workspace'` disables LSP
   * entirely (tsserver has no knowledge of an arbitrary opened folder's root).
   */
  scope?: 'src' | 'repo' | 'workspace'
  /** Scrolls/positions the cursor to this line (1-based) once real content loads — set by search-result and quick-open jumps. Re-fires if this changes while the tab stays open (e.g. a second search-result click). */
  revealLine?: number
  /** See useCodeEditorViewModel's own doc comment — fired after a successful save with the just-saved content. */
  onImportsChanged?: (path: string, content: string) => void
  /** Live getter for the "##token" completion extension's candidate pool. Omit to disable ## linking for this instance. */
  getGraphNodes?: () => GraphNode[]
  /** Fired once a "##token" resolves and its import has been spliced into the document. */
  onLinkResolved?: (path: string, target: GraphNode) => void
}

/** Imperative handle for callers that need to trigger a save from outside — e.g. OpenEditorsView's File > Save All, which can't reach into whichever tab owns the dirty document any other way. */
export interface CodeEditorHandle {
  save: () => Promise<void>
  /** Snapshot as of the last render — accurate by the time a user-triggered Save All actually reads it. */
  dirty: boolean
  /** Live LSP diagnostic count for this tab — see ProblemsDock. */
  problemCount: number
}

export const CodeEditorView = forwardRef<CodeEditorHandle, CodeEditorViewProps>(function CodeEditorView(
  { path, value, readOnly, onSaved, suppressAutoSave, writeFile, scope, revealLine, onImportsChanged, getGraphNodes, onLinkResolved },
  ref,
) {
  const { containerRef, dirty, status, errorMessage, save, runnable, running, runResult, run, problemCount } =
    useCodeEditorViewModel({ path, value, readOnly, suppressAutoSave, startDirty: suppressAutoSave, writeFile, scope, revealLine, onImportsChanged, getGraphNodes, onLinkResolved })

  const handleSave = async () => {
    await save()
    onSaved?.()
  }

  // No deps array — handleSave is a fresh closure every render anyway (it
  // isn't memoized), so bailing out on a stale deps list would just mean a
  // stale `save` reference. Recomputing every render is cheap here.
  useImperativeHandle(ref, () => ({ save: handleSave, dirty, problemCount }))

  return (
    <Frame flow="vertical" h="fill" w="fill" style={{ position: 'relative' }}>
      {!readOnly && (
        <Frame
          flow="horizontal"
          align="center"
          gap={8}
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
        >
          {status === 'error' && errorMessage && (
            <span style={{ fontSize: 9, color: '#e07a7a', maxWidth: 240, ...MONO }}>{errorMessage}</span>
          )}
          {suppressAutoSave && dirty ? (
            <span
              style={{
                fontSize: 9,
                letterSpacing: '0.08em',
                color: '#e0a040',
                border: '1px solid rgba(224,160,64,0.4)',
                padding: '2px 6px',
                ...MONO,
              }}
            >
              AI-GENERATED — UNSAVED
            </span>
          ) : (
            <span style={{ fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-3)', ...MONO }}>
              {status === 'saving' ? 'SAVING…' : dirty ? 'UNSAVED' : status === 'saved' ? 'SAVED' : ''}
            </span>
          )}
          {runnable && (
            <button
              onClick={run}
              disabled={running}
              title="Run"
              style={{
                background: running ? 'transparent' : 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'var(--text-1)',
                fontSize: 9,
                letterSpacing: '0.08em',
                padding: '4px 10px',
                cursor: running ? 'default' : 'pointer',
                opacity: running ? 0.5 : 1,
                ...MONO,
              }}
            >
              {running ? 'RUNNING…' : 'RUN'}
            </button>
          )}
          <Dropdown
            options={[{ value: 'save', label: 'Save (Ctrl/Cmd+S)' }]}
            onChange={() => handleSave()}
            trigger={
              <span style={{ fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-1)', ...MONO }}>
                FILE
              </span>
            }
          />
        </Frame>
      )}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} />
      {runResult && (
        <Frame
          flow="vertical"
          w="fill"
          maxH="35%"
          scroll="y"
          stroke={{ top: { color: 'rgba(255,255,255,0.15)', width: 1 } }}
          fill={{ solid: 'rgba(0,0,0,0.35)' }}
          padding={8}
        >
          <span style={{ fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-3)', ...MONO }}>
            EXIT CODE: {runResult.exitCode ?? 'none'}
          </span>
          {runResult.stdout && (
            <pre style={{ fontSize: 11, color: 'var(--text-1)', whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>
              {runResult.stdout}
            </pre>
          )}
          {runResult.stderr && (
            <pre style={{ fontSize: 11, color: '#e07a7a', whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>
              {runResult.stderr}
            </pre>
          )}
        </Frame>
      )}
    </Frame>
  )
})
